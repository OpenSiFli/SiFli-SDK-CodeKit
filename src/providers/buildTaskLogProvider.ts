import * as path from 'path';
import * as vscode from 'vscode';
import {
  BuildTaskChangeEvent,
  BuildTaskRecord,
  BuildTaskService,
  BuildTaskStatus,
  BuildTaskViewLogEntry,
} from '../services/buildTaskService';
import { getVueWebviewContent } from '../utils/vueWebviewContent';

interface BuildTaskViewModel {
  id: string;
  title: string;
  status: BuildTaskStatus;
  statusLabel: string;
  description: string;
  tooltip: string;
}

interface BuildTaskLogViewState {
  tasks: BuildTaskViewModel[];
  logs?: BuildTaskViewLogEntry[];
  logCount: number;
  activeCount: number;
  summaryLabel: string;
  emptyLogLabel: string;
}

export class BuildTaskLogProvider implements vscode.WebviewViewProvider {
  private static readonly LOG_FLUSH_DELAY_MS = 40;
  private static readonly STATE_UPDATE_DELAY_MS = 120;

  private view?: vscode.WebviewView;
  private readonly buildTaskService: BuildTaskService;
  private pendingLogFlush?: ReturnType<typeof setTimeout>;
  private pendingStateUpdate?: ReturnType<typeof setTimeout>;
  private pendingLogs: BuildTaskViewLogEntry[] = [];

  public constructor(private readonly extensionPath: string) {
    this.buildTaskService = BuildTaskService.getInstance();
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.extensionPath, 'webview-vue', 'dist')),
        vscode.Uri.file(path.join(this.extensionPath, 'webview-vue', 'dist', 'assets')),
      ],
    };
    webviewView.webview.html = getVueWebviewContent(webviewView.webview, this.extensionPath, {
      scriptFile: 'assets/buildLogs.js',
      cssFiles: ['assets/buildLogs.css', 'assets/xterm.css'],
      title: 'SiFli Logs',
    });

    const messageListener = webviewView.webview.onDidReceiveMessage(message => {
      if (message?.command === 'ready' || message?.command === 'buildTasks.ready') {
        this.postUpdate(true);
        return;
      }
      if (message?.command === 'buildTasks.openLocation') {
        void this.openLogLocation(message);
      }
    });

    webviewView.onDidDispose(() => {
      messageListener.dispose();
      this.clearPendingUpdates();
      if (this.view === webviewView) {
        this.view = undefined;
      }
    });

    this.postUpdate(true);
    this.updateBadge();
  }

  public refresh(): void {
    this.postUpdate(true);
  }

  public handleTaskServiceChange(event: BuildTaskChangeEvent): void {
    this.updateBadge();
    if (event.type === 'reset') {
      this.clearPendingUpdates();
      this.postUpdate(true);
      return;
    }

    if (event.type === 'logs' && event.logs?.length) {
      this.enqueueLogs(event.logs);
    }

    this.scheduleStateUpdate();
  }

  public updateBadge(): void {
    const activeCount = this.getActiveCount();
    if (!this.view) {
      return;
    }
    this.view.badge =
      activeCount > 0
        ? {
            value: activeCount,
            tooltip: vscode.l10n.t('{0} SiFli build task(s) active', String(activeCount)),
          }
        : undefined;
  }

  private postUpdate(includeLogs = false): void {
    if (includeLogs) {
      this.clearPendingUpdates();
    }
    this.view?.webview.postMessage({
      command: 'buildTasks.update',
      state: this.getViewState(includeLogs),
    });
  }

  private postAppendLogs(logs: BuildTaskViewLogEntry[]): void {
    this.view?.webview.postMessage({
      command: 'buildTasks.appendLogs',
      logs,
      logCount: this.buildTaskService.getViewLogCount(),
    });
  }

  private getViewState(includeLogs: boolean): BuildTaskLogViewState {
    const tasks = this.buildTaskService.getTasks();
    const activeCount = tasks.filter(task => task.status === 'queued' || task.status === 'running').length;
    return {
      tasks: tasks.map(task => this.toTaskViewModel(task)),
      ...(includeLogs ? { logs: this.buildTaskService.getViewLogs() } : {}),
      logCount: this.buildTaskService.getViewLogCount(),
      activeCount,
      summaryLabel:
        activeCount > 0
          ? vscode.l10n.t('{0} active', String(activeCount))
          : vscode.l10n.t('{0} task(s)', String(tasks.length)),
      emptyLogLabel: vscode.l10n.t('No SiFli build logs yet.'),
    };
  }

  private toTaskViewModel(task: BuildTaskRecord): BuildTaskViewModel {
    const exitText = task.exitCode === undefined ? undefined : vscode.l10n.t('exit {0}', String(task.exitCode));
    const description = [this.formatStatus(task.status), exitText, this.formatElapsed(task)]
      .filter(Boolean)
      .join(' · ');
    const latestLogs = task.recentLogs
      .slice(-5)
      .map(log => log.message)
      .join('\n');
    const tooltip = [
      task.title,
      `${vscode.l10n.t('Status')}: ${this.formatStatus(task.status)}`,
      task.command ? `${vscode.l10n.t('Command')}: ${task.command}` : undefined,
      task.cwd ? `${vscode.l10n.t('Working directory')}: ${task.cwd}` : undefined,
      task.error ? `${vscode.l10n.t('Error')}: ${task.error}` : undefined,
      latestLogs ? `${vscode.l10n.t('Recent logs')}:\n${latestLogs}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      id: task.id,
      title: task.title,
      status: task.status,
      statusLabel: this.formatStatus(task.status),
      description,
      tooltip,
    };
  }

  private getActiveCount(): number {
    return this.buildTaskService.getTasks().filter(task => task.status === 'queued' || task.status === 'running')
      .length;
  }

  private enqueueLogs(logs: BuildTaskViewLogEntry[]): void {
    if (!this.view) {
      return;
    }
    this.pendingLogs.push(...logs);
    if (this.pendingLogFlush) {
      return;
    }
    this.pendingLogFlush = setTimeout(() => this.flushPendingLogs(), BuildTaskLogProvider.LOG_FLUSH_DELAY_MS);
  }

  private flushPendingLogs(): void {
    this.pendingLogFlush = undefined;
    const logs = this.pendingLogs.splice(0, this.pendingLogs.length);
    if (logs.length === 0) {
      return;
    }
    this.postAppendLogs(logs);
  }

  private scheduleStateUpdate(): void {
    if (!this.view || this.pendingStateUpdate) {
      return;
    }
    this.pendingStateUpdate = setTimeout(() => {
      this.pendingStateUpdate = undefined;
      this.postUpdate(false);
    }, BuildTaskLogProvider.STATE_UPDATE_DELAY_MS);
  }

  private clearPendingUpdates(): void {
    if (this.pendingLogFlush) {
      clearTimeout(this.pendingLogFlush);
      this.pendingLogFlush = undefined;
    }
    if (this.pendingStateUpdate) {
      clearTimeout(this.pendingStateUpdate);
      this.pendingStateUpdate = undefined;
    }
    this.pendingLogs.splice(0, this.pendingLogs.length);
  }

  private async openLogLocation(message: unknown): Promise<void> {
    const location = this.parseOpenLocationMessage(message);
    if (!location) {
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(location.path));
      const editor = await vscode.window.showTextDocument(document, { preserveFocus: false });
      const position = new vscode.Position(Math.max(location.line - 1, 0), Math.max((location.column ?? 1) - 1, 0));
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      void vscode.window.showWarningMessage(vscode.l10n.t('Unable to open log location: {0}', messageText));
    }
  }

  private parseOpenLocationMessage(message: unknown): { path: string; line: number; column?: number } | undefined {
    if (!message || typeof message !== 'object') {
      return undefined;
    }
    const record = message as Record<string, unknown>;
    if (typeof record.path !== 'string' || record.path.trim().length === 0) {
      return undefined;
    }
    const line = this.parsePositiveInteger(record.line) ?? 1;
    const column = this.parsePositiveInteger(record.column);
    return {
      path: record.path,
      line,
      ...(column === undefined ? {} : { column }),
    };
  }

  private parsePositiveInteger(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
      return undefined;
    }
    return value;
  }

  private formatStatus(status: BuildTaskRecord['status']): string {
    switch (status) {
      case 'queued':
        return vscode.l10n.t('Queued');
      case 'running':
        return vscode.l10n.t('Running');
      case 'succeeded':
        return vscode.l10n.t('Succeeded');
      case 'failed':
        return vscode.l10n.t('Failed');
      default:
        return status;
    }
  }

  private formatElapsed(task: BuildTaskRecord): string | undefined {
    const start = task.startedAt ? Date.parse(task.startedAt) : Date.parse(task.queuedAt);
    const end = task.finishedAt ? Date.parse(task.finishedAt) : task.status === 'running' ? Date.now() : undefined;
    if (!Number.isFinite(start) || end === undefined || !Number.isFinite(end)) {
      return undefined;
    }
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    if (seconds < 60) {
      return vscode.l10n.t('{0}s', String(seconds));
    }
    return vscode.l10n.t('{0}m {1}s', String(Math.floor(seconds / 60)), String(seconds % 60));
  }
}

export class BuildTaskLogManager {
  private static instance: BuildTaskLogManager;
  private readonly provider: BuildTaskLogProvider;
  private readonly buildTaskService: BuildTaskService;

  private constructor(extensionPath: string) {
    this.provider = new BuildTaskLogProvider(extensionPath);
    this.buildTaskService = BuildTaskService.getInstance();
  }

  public static getInstance(extensionPath: string): BuildTaskLogManager {
    if (!BuildTaskLogManager.instance) {
      BuildTaskLogManager.instance = new BuildTaskLogManager(extensionPath);
    }
    return BuildTaskLogManager.instance;
  }

  public register(context: vscode.ExtensionContext): void {
    const webviewRegistration = vscode.window.registerWebviewViewProvider('sifliBuildTasks', this.provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    });
    const refreshListener = this.buildTaskService.onDidChangeTasks(event => {
      this.provider.handleTaskServiceChange(event);
    });

    const showLogsCommand = vscode.commands.registerCommand('extension.buildTasks.showLogs', () => {
      this.buildTaskService.showLogs();
    });
    const refreshCommand = vscode.commands.registerCommand('extension.buildTasks.refresh', () => {
      this.provider.refresh();
      this.buildTaskService.refresh();
    });
    const clearLogsCommand = vscode.commands.registerCommand('extension.buildTasks.clearLogs', () => {
      this.buildTaskService.clearLogs();
    });
    const clearFinishedCommand = vscode.commands.registerCommand('extension.buildTasks.clearFinished', () => {
      this.buildTaskService.clearFinishedTasks();
    });

    context.subscriptions.push(
      webviewRegistration,
      refreshListener,
      showLogsCommand,
      refreshCommand,
      clearLogsCommand,
      clearFinishedCommand
    );
  }
}
