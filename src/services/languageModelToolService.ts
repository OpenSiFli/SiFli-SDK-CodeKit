import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { LM_TOOL_NAMES, TERMINAL_NAME } from '../constants';
import { WorkflowReference } from '../types';
import { StatusBarProvider } from '../providers/statusBarProvider';
import { ScopedWorkflowDefinition, WorkflowService } from './workflowService';
import { ConfigService } from './configService';
import { BoardService } from './boardService';
import { SerialPortService } from './serialPortService';
import { SerialMonitorService } from './serialMonitorService';
import { BuildExecutionService } from './buildExecutionService';
import { LogService } from './logService';
import { isSiFliProject } from '../utils/projectUtils';

type EmptyInput = Record<string, never>;

type ToolDescriptor<T extends object> = {
  name: string;
  confirmationTitle?: string | ((input: T) => string);
  confirmationMessage?: string | ((input: T) => string | vscode.MarkdownString);
  invocationMessage?: string | ((input: T) => string | vscode.MarkdownString);
  invoke: (input: T, token: vscode.CancellationToken) => Promise<unknown>;
};

type ProjectState = {
  isSiFliProject: boolean;
  currentSdk: {
    version: string;
    path: string;
    valid: boolean;
  } | null;
  selectedBoard: string | null;
  numThreads: number;
  selectedSerialPort: string | null;
  downloadBaudRate: number;
  monitorBaudRate: number;
  monitorActive: boolean;
  workflowCounts: {
    workspace: number;
    user: number;
    resolved: number;
  };
};

export class LanguageModelToolService {
  private static instance: LanguageModelToolService;

  private readonly workflowService: WorkflowService;
  private readonly configService: ConfigService;
  private readonly boardService: BoardService;
  private readonly serialPortService: SerialPortService;
  private readonly serialMonitorService: SerialMonitorService;
  private readonly buildExecutionService: BuildExecutionService;
  private readonly statusBarProvider: StatusBarProvider;
  private readonly logService: LogService;

  private constructor() {
    this.workflowService = WorkflowService.getInstance();
    this.configService = ConfigService.getInstance();
    this.boardService = BoardService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
    this.serialMonitorService = SerialMonitorService.getInstance();
    this.buildExecutionService = BuildExecutionService.getInstance();
    this.statusBarProvider = StatusBarProvider.getInstance();
    this.logService = LogService.getInstance();
  }

  public static getInstance(): LanguageModelToolService {
    if (!LanguageModelToolService.instance) {
      LanguageModelToolService.instance = new LanguageModelToolService();
    }
    return LanguageModelToolService.instance;
  }

  public register(context: vscode.ExtensionContext): void {
    this.registerTool<EmptyInput>(context, {
      name: LM_TOOL_NAMES.GET_PROJECT_STATE,
      invoke: async () => ({
        success: true,
        operation: 'getProjectState',
        state: this.getProjectState(),
      }),
    });

    this.registerTool<{ scope?: 'workspace' | 'user' | 'all' }>(context, {
      name: LM_TOOL_NAMES.LIST_WORKFLOWS,
      invoke: async input => ({
        success: true,
        operation: 'listWorkflows',
        scope: input.scope ?? 'all',
        workflows: this.listWorkflows(input.scope ?? 'all'),
        state: this.getProjectState(),
      }),
    });

    this.registerTool<EmptyInput>(context, {
      name: LM_TOOL_NAMES.LIST_BOARDS,
      invoke: async () => ({
        success: true,
        operation: 'listBoards',
        boards: await this.listBoards(),
        state: this.getProjectState(),
      }),
    });

    this.registerTool<EmptyInput>(context, {
      name: LM_TOOL_NAMES.LIST_SERIAL_PORTS,
      invoke: async () => ({
        success: true,
        operation: 'listSerialPorts',
        ports: await this.listSerialPorts(),
        state: this.getProjectState(),
      }),
    });

    this.registerTool<{ workflowRef: string; inputs?: Record<string, string> }>(context, {
      name: LM_TOOL_NAMES.RUN_WORKFLOW,
      invocationMessage: input => vscode.l10n.t('Running workflow {0}', input.workflowRef),
      confirmationTitle: input => vscode.l10n.t('Run workflow {0}?', input.workflowRef),
      confirmationMessage: input => vscode.l10n.t('Run workflow {0} with language model tools.', input.workflowRef),
      invoke: async input => this.runWorkflow(input.workflowRef, input.inputs),
    });

    this.registerTool<EmptyInput>(context, {
      name: LM_TOOL_NAMES.COMPILE,
      invocationMessage: vscode.l10n.t('Running SiFli build'),
      confirmationTitle: vscode.l10n.t('Run SiFli build?'),
      confirmationMessage: vscode.l10n.t('Compile the current SiFli project in the integrated terminal.'),
      invoke: async () => this.compile(),
    });

    this.registerTool<EmptyInput>(context, {
      name: LM_TOOL_NAMES.REBUILD,
      invocationMessage: vscode.l10n.t('Running SiFli rebuild'),
      confirmationTitle: vscode.l10n.t('Run SiFli rebuild?'),
      confirmationMessage: vscode.l10n.t('Clean and compile the current SiFli project.'),
      invoke: async () => this.rebuild(),
    });

    this.registerTool<EmptyInput>(context, {
      name: LM_TOOL_NAMES.CLEAN,
      invocationMessage: vscode.l10n.t('Cleaning SiFli build output'),
      confirmationTitle: vscode.l10n.t('Clean SiFli build output?'),
      confirmationMessage: vscode.l10n.t('Delete the current SiFli build output folder.'),
      invoke: async () => this.clean(),
    });

    this.registerTool<EmptyInput>(context, {
      name: LM_TOOL_NAMES.DOWNLOAD,
      invocationMessage: vscode.l10n.t('Downloading to device'),
      confirmationTitle: vscode.l10n.t('Download to device?'),
      confirmationMessage: vscode.l10n.t('Flash the current build to the selected serial device.'),
      invoke: async () => this.download(),
    });

    this.registerTool<{ boardName: string; numThreads?: number }>(context, {
      name: LM_TOOL_NAMES.SELECT_BOARD,
      invocationMessage: input => vscode.l10n.t('Selecting board {0}', input.boardName),
      confirmationTitle: input => vscode.l10n.t('Select board {0}?', input.boardName),
      confirmationMessage: input => vscode.l10n.t('Set the active SiFli board to {0}.', input.boardName),
      invoke: async input => this.selectBoard(input.boardName, input.numThreads),
    });

    this.registerTool<{ port: string; downloadBaud?: number; monitorBaud?: number }>(context, {
      name: LM_TOOL_NAMES.SELECT_SERIAL_PORT,
      invocationMessage: input => vscode.l10n.t('Selecting serial port {0}', input.port),
      confirmationTitle: input => vscode.l10n.t('Select serial port {0}?', input.port),
      confirmationMessage: input => vscode.l10n.t('Set the active serial port to {0}.', input.port),
      invoke: async input => this.selectSerialPort(input.port, input.downloadBaud, input.monitorBaud),
    });

    this.registerTool<EmptyInput>(context, {
      name: LM_TOOL_NAMES.OPEN_MONITOR,
      invocationMessage: vscode.l10n.t('Opening device monitor'),
      confirmationTitle: vscode.l10n.t('Open device monitor?'),
      confirmationMessage: vscode.l10n.t('Open the serial monitor for the selected device.'),
      invoke: async () => this.openMonitor(),
    });

    this.registerTool<EmptyInput>(context, {
      name: LM_TOOL_NAMES.CLOSE_MONITOR,
      invocationMessage: vscode.l10n.t('Closing device monitor'),
      confirmationTitle: vscode.l10n.t('Close device monitor?'),
      confirmationMessage: vscode.l10n.t('Close the active serial monitor session.'),
      invoke: async () => this.closeMonitor(),
    });
  }

  private registerTool<T extends object>(context: vscode.ExtensionContext, descriptor: ToolDescriptor<T>): void {
    const tool: vscode.LanguageModelTool<T> = {
      prepareInvocation: async options => {
        if (!descriptor.confirmationTitle && !descriptor.confirmationMessage && !descriptor.invocationMessage) {
          return undefined;
        }
        return {
          invocationMessage: this.resolveMessage(descriptor.invocationMessage, options.input),
          confirmationMessages:
            descriptor.confirmationTitle || descriptor.confirmationMessage
              ? {
                  title: this.resolveTitle(descriptor.confirmationTitle, options.input) ?? descriptor.name,
                  message: this.resolveMessage(descriptor.confirmationMessage, options.input) ?? descriptor.name,
                }
              : undefined,
        };
      },
      invoke: async (options, token) => {
        const payload = await descriptor.invoke(options.input, token);
        return this.toToolResult(payload);
      },
    };

    context.subscriptions.push(vscode.lm.registerTool(descriptor.name, tool));
  }

  private resolveMessage<T extends object>(
    value: string | vscode.MarkdownString | ((input: T) => string | vscode.MarkdownString) | undefined,
    input: T
  ): string | vscode.MarkdownString | undefined {
    if (!value) {
      return undefined;
    }
    return typeof value === 'function' ? value(input) : value;
  }

  private resolveTitle<T extends object>(
    value: string | ((input: T) => string) | undefined,
    input: T
  ): string | undefined {
    if (!value) {
      return undefined;
    }
    return typeof value === 'function' ? value(input) : value;
  }

  private toToolResult(payload: unknown): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))]);
  }

  private ensureSiFliProject(): { ok: true } | { ok: false; payload: unknown } {
    if (isSiFliProject()) {
      return { ok: true };
    }
    return {
      ok: false,
      payload: {
        success: false,
        message: vscode.l10n.t('Language model tools are only available in a SiFli project.'),
        state: this.getProjectState(),
      },
    };
  }

  private getProjectState(): ProjectState {
    const currentSdk = this.configService.getCurrentSdk();
    const selectedBoard = this.configService.getSelectedBoardName();
    return {
      isSiFliProject: isSiFliProject(),
      currentSdk: currentSdk
        ? {
            version: currentSdk.version,
            path: currentSdk.path,
            valid: currentSdk.valid,
          }
        : null,
      selectedBoard: selectedBoard && selectedBoard !== 'N/A' ? selectedBoard : null,
      numThreads: this.configService.getNumThreads(),
      selectedSerialPort: this.serialPortService.selectedSerialPort,
      downloadBaudRate: this.serialPortService.downloadBaudRate,
      monitorBaudRate: this.serialPortService.monitorBaudRate,
      monitorActive: this.serialMonitorService.hasActiveMonitor(),
      workflowCounts: {
        workspace: this.workflowService.getWorkspaceWorkflows().length,
        user: this.workflowService.getUserWorkflows().length,
        resolved: this.workflowService.getResolvedWorkflows().length,
      },
    };
  }

  private listWorkflows(scope: 'workspace' | 'user' | 'all'): unknown[] {
    const workflows = this.workflowService
      .getAllScopedWorkflows()
      .filter(item => scope === 'all' || item.scope === scope);
    return workflows.map(item => this.describeWorkflow(item));
  }

  private describeWorkflow(item: ScopedWorkflowDefinition): unknown {
    const compatibility = this.workflowService.getWorkflowToolCompatibility(item.workflowRef);
    const inputs = Array.isArray(item.workflow.inputs)
      ? item.workflow.inputs.map(input => ({
          key: input.key,
          prompt: input.prompt,
          placeHolder: input.placeHolder,
          defaultValue: input.defaultValue,
          required: !!input.required,
          password: !!input.password,
        }))
      : [];

    return {
      workflowRef: item.workflowRef,
      scope: item.scope,
      id: item.workflow.id,
      name: item.workflow.name,
      description: item.workflow.description,
      stepCount: Array.isArray(item.workflow.steps) ? item.workflow.steps.length : 0,
      stepTypes: Array.isArray(item.workflow.steps) ? item.workflow.steps.map(step => step.type) : [],
      inputs,
      hasShellCommand: compatibility.hasShellCommand,
      runnableByTool: compatibility.runnable,
      notRunnableReasons: compatibility.reasons,
    };
  }

  private async listBoards(): Promise<unknown[]> {
    const boards = await this.boardService.discoverBoards();
    const selectedBoard = this.configService.getSelectedBoardName();
    return boards.map(board => ({
      name: board.name,
      type: board.type,
      path: board.path,
      selected: board.name === selectedBoard,
    }));
  }

  private async listSerialPorts(): Promise<unknown[]> {
    const ports = await this.serialPortService.getSerialPorts();
    const selectedPort = this.serialPortService.selectedSerialPort;
    const supportedBaudRates = SerialPortService.getBaudRates();
    return ports.map(port => ({
      path: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
      vendorId: port.vendorId,
      productId: port.productId,
      selected: port.path === selectedPort,
      supportedBaudRates,
      currentDownloadBaudRate: this.serialPortService.downloadBaudRate,
      currentMonitorBaudRate: this.serialPortService.monitorBaudRate,
    }));
  }

  private async runWorkflow(workflowRef: string, inputs?: Record<string, string>): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const runId = this.createRunId('workflow');
    const result = await this.workflowService.executeWorkflowByReference(workflowRef as WorkflowReference, {
      inputs,
      runId,
    });

    return {
      success: result.success,
      operation: 'runWorkflow',
      workflowRef: result.workflowRef ?? workflowRef,
      workflowName: result.workflowName,
      workflowScope: result.workflowScope,
      dryRun: result.dryRun,
      runId: result.runId,
      terminalName: result.runId ? TERMINAL_NAME : undefined,
      exitCode: result.exitCode,
      failedStepIndex: result.failedStepIndex,
      failedStepType: result.failedStepType,
      skippedStepIndexes: result.skippedStepIndexes,
      continuedFailureSteps: result.continuedFailureSteps,
      message: result.message,
      state: this.getProjectState(),
    };
  }

  private async compile(): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const runId = this.createRunId('build');
    const result = await this.buildExecutionService.executeCompileDetailed({
      waitForExit: true,
      showNotifications: false,
      runId,
    });
    return this.buildOperationPayload(
      'compile',
      runId,
      result.success,
      result.exitCode,
      result.command,
      result.message
    );
  }

  private async rebuild(): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const cleanResult = this.buildExecutionService.executeCleanDetailed(false);
    if (!cleanResult.success) {
      return {
        success: false,
        operation: 'rebuild',
        message: cleanResult.message,
        state: this.getProjectState(),
      };
    }

    const runId = this.createRunId('rebuild');
    const compileResult = await this.buildExecutionService.executeCompileDetailed({
      waitForExit: true,
      showNotifications: false,
      runId,
    });
    return this.buildOperationPayload(
      'rebuild',
      runId,
      compileResult.success,
      compileResult.exitCode,
      compileResult.command,
      compileResult.message
    );
  }

  private async clean(): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const result = this.buildExecutionService.executeCleanDetailed(false);
    return {
      success: result.success,
      operation: 'clean',
      message: result.message,
      state: this.getProjectState(),
    };
  }

  private async download(): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const monitorWasActive = this.serialMonitorService.hasActiveMonitor();
    if (monitorWasActive) {
      await this.serialMonitorService.closeSerialMonitor();
    }

    const runId = this.createRunId('download');
    const result = await this.buildExecutionService.executeDownloadDetailed({
      waitForExit: true,
      ensureBuildDirectory: true,
      promptBuildIfMissing: false,
      showNotifications: false,
      runId,
    });

    if (this.serialMonitorService.canResume()) {
      await this.serialMonitorService.resumeSerialMonitor();
    }

    return this.buildOperationPayload(
      'download',
      runId,
      result.success,
      result.exitCode,
      result.command,
      result.message,
      {
        resumedMonitor: monitorWasActive && this.serialMonitorService.hasActiveMonitor(),
      }
    );
  }

  private async selectBoard(boardName: string, numThreads?: number): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const boards = await this.boardService.discoverBoards();
    const board = boards.find(item => item.name === boardName);
    if (!board) {
      return {
        success: false,
        operation: 'selectBoard',
        message: vscode.l10n.t('Board not found: {0}', boardName),
        boards: boards.map(item => item.name),
        state: this.getProjectState(),
      };
    }

    if (numThreads !== undefined && (!Number.isInteger(numThreads) || numThreads <= 0)) {
      return {
        success: false,
        operation: 'selectBoard',
        message: vscode.l10n.t('Build threads must be a positive integer.'),
      };
    }

    await this.configService.setSelectedBoardName(board.name);
    if (numThreads !== undefined) {
      await this.configService.setNumThreads(numThreads);
    }
    this.statusBarProvider.updateStatusBarItems();

    return {
      success: true,
      operation: 'selectBoard',
      board: {
        name: board.name,
        type: board.type,
        path: board.path,
      },
      numThreads: this.configService.getNumThreads(),
      state: this.getProjectState(),
    };
  }

  private async selectSerialPort(portPath: string, downloadBaud?: number, monitorBaud?: number): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const ports = await this.serialPortService.getSerialPorts();
    const port = ports.find(item => item.path === portPath);
    if (!port) {
      return {
        success: false,
        operation: 'selectSerialPort',
        message: vscode.l10n.t('Serial port not found: {0}', portPath),
        ports: ports.map(item => item.path),
        state: this.getProjectState(),
      };
    }

    const supportedBaudRates = new Set(SerialPortService.getBaudRates());
    if (downloadBaud !== undefined && !supportedBaudRates.has(downloadBaud)) {
      return {
        success: false,
        operation: 'selectSerialPort',
        message: vscode.l10n.t('Unsupported download baud rate: {0}', String(downloadBaud)),
      };
    }
    if (monitorBaud !== undefined && !supportedBaudRates.has(monitorBaud)) {
      return {
        success: false,
        operation: 'selectSerialPort',
        message: vscode.l10n.t('Unsupported monitor baud rate: {0}', String(monitorBaud)),
      };
    }

    this.serialPortService.selectedSerialPort = port.path;
    if (downloadBaud !== undefined) {
      this.serialPortService.downloadBaudRate = downloadBaud;
    }
    if (monitorBaud !== undefined) {
      this.serialPortService.monitorBaudRate = monitorBaud;
    }
    this.statusBarProvider.updateStatusBarItems();

    return {
      success: true,
      operation: 'selectSerialPort',
      port: {
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
      },
      downloadBaudRate: this.serialPortService.downloadBaudRate,
      monitorBaudRate: this.serialPortService.monitorBaudRate,
      state: this.getProjectState(),
    };
  }

  private async openMonitor(): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    await this.serialMonitorService.initialize();
    const selectedPort = this.serialPortService.selectedSerialPort;
    if (!selectedPort) {
      return {
        success: false,
        operation: 'openMonitor',
        message: vscode.l10n.t('Select a serial port first. Click "COM: N/A" in the status bar.'),
        state: this.getProjectState(),
      };
    }

    const success = await this.serialMonitorService.openSerialMonitor(
      selectedPort,
      this.serialPortService.monitorBaudRate
    );
    this.statusBarProvider.updateStatusBarItems();

    return {
      success,
      operation: 'openMonitor',
      port: selectedPort,
      monitorBaudRate: this.serialPortService.monitorBaudRate,
      state: this.getProjectState(),
    };
  }

  private async closeMonitor(): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const success = await this.serialMonitorService.closeSerialMonitor();
    this.statusBarProvider.updateStatusBarItems();

    return {
      success,
      operation: 'closeMonitor',
      state: this.getProjectState(),
    };
  }

  private buildOperationPayload(
    operation: string,
    runId: string,
    success: boolean,
    exitCode?: number,
    command?: string,
    message?: string,
    extras?: Record<string, unknown>
  ): unknown {
    return {
      success,
      operation,
      runId,
      terminalName: TERMINAL_NAME,
      exitCode,
      command,
      message,
      state: this.getProjectState(),
      ...extras,
    };
  }

  private createRunId(prefix: string): string {
    const runId = `${prefix}-${randomUUID()}`;
    this.logService.info(`Created LM tool run id: ${runId}`);
    return runId;
  }
}
