import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  DebugSnapshotBackendEvent,
  DebugSnapshotBootstrap,
  DebugSnapshotOutputRootSelection,
  DebugSnapshotPlan,
  DebugSnapshotRequest,
  DebugSnapshotTaskRecord,
} from '../../types/debugSnapshot';
import { LogService } from '../../services/logService';
import { ChipCatalogService } from './chipCatalogService';
import { SnapshotExecutor, DebugSnapshotCancelledError } from './snapshotExecutor';
import { SnapshotPlanner } from './snapshotPlanner';
import { SnapshotSerializer } from './snapshotSerializer';
import { SnapshotTemplateRegistry } from './snapshotTemplateRegistry';
import { SvdPeripheralCatalogService } from './svdPeripheralCatalogService';
import { PeripheralTreeProvider } from '../views/peripheral-tree-provider';
import { PeripheralViewerSessionData } from '../session-data';

const LAST_OUTPUT_ROOT_KEY = 'debugSnapshot.lastOutputRoot';

interface RunningTaskState {
  record: DebugSnapshotTaskRecord;
  cancellationToken: {
    isCancellationRequested: boolean;
  };
  completion: Promise<DebugSnapshotTaskRecord>;
}

export class DebugSnapshotBackend {
  private readonly chipCatalogService: ChipCatalogService;
  private readonly templateRegistry = new SnapshotTemplateRegistry();
  private readonly svdPeripheralCatalogService: SvdPeripheralCatalogService;
  private readonly snapshotPlanner: SnapshotPlanner;
  private readonly snapshotExecutor: SnapshotExecutor;
  private readonly snapshotSerializer = new SnapshotSerializer();
  private readonly tasks = new Map<string, RunningTaskState>();
  private readonly eventEmitter = new vscode.EventEmitter<DebugSnapshotBackendEvent>();

  public readonly onDidEmitEvent = this.eventEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly treeProvider: PeripheralTreeProvider,
    private readonly logService = LogService.getInstance()
  ) {
    this.chipCatalogService = new ChipCatalogService(context.extensionPath);
    this.svdPeripheralCatalogService = new SvdPeripheralCatalogService(treeProvider);
    this.snapshotPlanner = new SnapshotPlanner(this.templateRegistry, this.svdPeripheralCatalogService);
    this.snapshotExecutor = new SnapshotExecutor(this.svdPeripheralCatalogService);
  }

  public async getDebugSnapshotBootstrap(): Promise<DebugSnapshotBootstrap> {
    const sessionData = this.treeProvider.getActiveSessionData();
    const exportable = this.getExportableSessionData(sessionData);
    const warnings = exportable ? [] : [this.getNotExportableMessage(sessionData)];

    return {
      session: {
        sessionId: sessionData?.session.id,
        sessionName: sessionData?.session.name,
        executionState: sessionData?.executionState ?? 'unknown',
        svdPath: sessionData?.svdPath,
        canExport: !!exportable,
      },
      chipOptions: this.chipCatalogService.listChipOptions(),
      warnings,
      lastOutputRoot: this.getLastOutputRoot(),
    };
  }

  public async buildDebugSnapshotPlan(partNumber: string): Promise<DebugSnapshotPlan> {
    const sessionData = this.requireExportableSessionData();
    const chip = this.chipCatalogService.getChipDefinition(partNumber);
    if (!chip) {
      throw new Error(`Unknown debug snapshot part number: ${partNumber}.`);
    }

    return this.snapshotPlanner.buildPlan(sessionData, chip);
  }

  public async browseDebugSnapshotOutputRoot(): Promise<DebugSnapshotOutputRootSelection> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: vscode.l10n.t('Select output folder'),
      defaultUri: vscode.Uri.file(this.getLastOutputRoot() ?? os.homedir()),
    });

    return {
      outputRoot: result?.[0]?.fsPath,
      cancelled: !result || result.length === 0,
    };
  }

  public async startDebugSnapshotExport(request: DebugSnapshotRequest): Promise<DebugSnapshotTaskRecord> {
    const sessionData = this.requireExportableSessionData();
    const plan = await this.buildDebugSnapshotPlan(request.partNumber);
    const selectedItems = plan.items.filter(item => request.selectedItemIds.includes(item.id));
    if (selectedItems.length === 0) {
      throw new Error('No debug snapshot items were selected.');
    }

    const taskId = `debug-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const outputDir = path.join(request.outputRoot, this.buildOutputDirectoryName(request.partNumber));
    const record: DebugSnapshotTaskRecord = {
      taskId,
      partNumber: request.partNumber,
      modelId: plan.chip.modelId,
      request,
      status: 'running',
      startedAt: new Date().toISOString(),
      outputDir,
      logs: [],
      files: [],
      warnings: [...plan.warnings],
    };

    this.setLastOutputRoot(request.outputRoot);

    const state: RunningTaskState = {
      record,
      cancellationToken: {
        isCancellationRequested: false,
      },
      completion: Promise.resolve(this.cloneTaskRecord(record)),
    };

    this.tasks.set(taskId, state);
    state.completion = this.runTask(sessionData, plan, selectedItems, state, outputDir);
    this.emitTaskUpdated(record);
    return this.cloneTaskRecord(record);
  }

  public getDebugSnapshotTask(taskId: string): DebugSnapshotTaskRecord | undefined {
    return this.tasks.get(taskId) ? this.cloneTaskRecord(this.tasks.get(taskId)!.record) : undefined;
  }

  public async cancelDebugSnapshotTask(taskId: string): Promise<DebugSnapshotTaskRecord | undefined> {
    const state = this.tasks.get(taskId);
    if (!state) {
      return undefined;
    }

    state.cancellationToken.isCancellationRequested = true;
    return this.cloneTaskRecord(state.record);
  }

  public async waitForTaskCompletion(taskId: string): Promise<DebugSnapshotTaskRecord | undefined> {
    const state = this.tasks.get(taskId);
    if (!state) {
      return undefined;
    }

    return this.cloneTaskRecord(await state.completion);
  }

  private async runTask(
    sessionData: PeripheralViewerSessionData,
    plan: DebugSnapshotPlan,
    selectedItems: DebugSnapshotPlan['items'],
    state: RunningTaskState,
    outputDir: string
  ): Promise<DebugSnapshotTaskRecord> {
    const record = state.record;
    try {
      const execution = await this.snapshotExecutor.execute({
        sessionData,
        outputDir,
        items: selectedItems,
        cancellationToken: state.cancellationToken,
        onLog: (message, level = 'info') => this.appendTaskLog(record, message, level),
      });

      record.files = execution.files;
      record.manifestPath = this.snapshotSerializer.writeManifest({
        outputDir,
        sessionData,
        partNumber: plan.chip.partNumber,
        modelId: plan.chip.modelId,
        items: selectedItems,
        files: execution.files,
        peripherals: execution.peripherals,
        warnings: record.warnings,
      });
      record.status = 'succeeded';
      record.finishedAt = new Date().toISOString();
      this.emitTaskFinished(record);
      return record;
    } catch (error) {
      record.finishedAt = new Date().toISOString();

      if (error instanceof DebugSnapshotCancelledError) {
        record.status = 'cancelled';
        record.error = error.message;
        this.appendTaskLog(record, error.message, 'warn');
      } else {
        record.status = 'failed';
        record.error = error instanceof Error ? error.message : String(error);
        this.appendTaskLog(record, record.error, 'error');
        this.eventEmitter.fire({
          command: 'debugSnapshotError',
          message: record.error,
          taskId: record.taskId,
        });
      }

      this.emitTaskFinished(record);
      return record;
    }
  }

  private emitTaskUpdated(task: DebugSnapshotTaskRecord): void {
    this.eventEmitter.fire({
      command: 'debugSnapshotTaskUpdated',
      task: this.cloneTaskRecord(task),
    });
  }

  private emitTaskFinished(task: DebugSnapshotTaskRecord): void {
    this.eventEmitter.fire({
      command: 'debugSnapshotTaskFinished',
      task: this.cloneTaskRecord(task),
    });
  }

  private appendTaskLog(record: DebugSnapshotTaskRecord, message: string, level: 'info' | 'warn' | 'error'): void {
    record.logs.push({
      ts: new Date().toISOString(),
      level,
      message,
    });
    const prefix = `[debugSnapshot:${record.taskId}] ${message}`;
    if (level === 'error') {
      this.logService.error(prefix);
    } else if (level === 'warn') {
      this.logService.warn(prefix);
    } else {
      this.logService.info(prefix);
    }
    this.emitTaskUpdated(record);
  }

  private buildOutputDirectoryName(partNumber: string): string {
    const now = new Date();
    const stamp = [
      now.getFullYear().toString(),
      (now.getMonth() + 1).toString().padStart(2, '0'),
      now.getDate().toString().padStart(2, '0'),
      '-',
      now.getHours().toString().padStart(2, '0'),
      now.getMinutes().toString().padStart(2, '0'),
      now.getSeconds().toString().padStart(2, '0'),
    ].join('');
    return `debug-snapshot-${partNumber}-${stamp}`;
  }

  private getLastOutputRoot(): string | undefined {
    return this.context.workspaceState.get<string>(LAST_OUTPUT_ROOT_KEY);
  }

  private setLastOutputRoot(outputRoot: string): void {
    void this.context.workspaceState.update(LAST_OUTPUT_ROOT_KEY, outputRoot);
  }

  private getExportableSessionData(
    sessionData: PeripheralViewerSessionData | undefined
  ): PeripheralViewerSessionData | undefined {
    if (!sessionData) {
      return undefined;
    }

    return sessionData.executionState === 'stopped' ? sessionData : undefined;
  }

  private requireExportableSessionData(): PeripheralViewerSessionData {
    const sessionData = this.treeProvider.getActiveSessionData();
    const exportable = this.getExportableSessionData(sessionData);
    if (!exportable) {
      throw new Error(this.getNotExportableMessage(sessionData));
    }

    return exportable;
  }

  private getNotExportableMessage(sessionData: PeripheralViewerSessionData | undefined): string {
    if (!sessionData) {
      return 'Debug snapshot export requires an active sifli-probe-rs session with a loaded SVD.';
    }

    if (sessionData.executionState !== 'stopped') {
      return 'Debug snapshot export is only available while the target is paused.';
    }

    return 'Debug snapshot export is not available for the current session.';
  }

  private cloneTaskRecord(task: DebugSnapshotTaskRecord): DebugSnapshotTaskRecord {
    return JSON.parse(JSON.stringify(task)) as DebugSnapshotTaskRecord;
  }
}
