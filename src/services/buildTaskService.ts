import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { TASK_NAMES } from '../constants';
import { TaskName } from '../types';
import { buildExportedEnvironmentPythonSnippet, parseExportedEnvironmentFile } from '../utils/exportedEnvironmentUtils';
import {
  buildPowerShellDotSourceCommandWithOutputToError,
  quotePowerShellString,
  resolvePowerShellExecutable,
} from '../utils/powerShellUtils';
import { getProjectInfo } from '../utils/projectUtils';
import { ConfigService } from './configService';
import { LogService } from './logService';
import { ProbeRsService } from './probeRsService';
import { SdkService } from './sdkService';
import { WindowsManagedEnvService } from './windowsManagedEnvService';

export type BuildTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface BuildTaskLogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface BuildTaskViewLogEntry extends BuildTaskLogEntry {
  id: string;
  taskId: string;
  taskTitle: string;
}

export interface BuildTaskChangeEvent {
  type: 'state' | 'logs' | 'reset';
  logs?: BuildTaskViewLogEntry[];
}

export interface BuildTaskRecord {
  id: string;
  taskName: TaskName;
  title: string;
  command?: string;
  cwd?: string;
  status: BuildTaskStatus;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  error?: string;
  recentLogs: BuildTaskLogEntry[];
}

export interface RunShellTaskOptions {
  taskName: TaskName;
  title?: string;
  commandLine: string;
  cwd?: string;
  waitForExit?: boolean;
  timeoutMs?: number;
  runId?: string;
}

export interface RunTaskResult {
  taskId: string;
  exitCode?: number;
  background: boolean;
}

interface QueuedTask {
  task: BuildTaskRecord;
  options: RunShellTaskOptions;
  resolve: (exitCode: number | undefined) => void;
  reject: (error: Error) => void;
}

interface CachedEnvironment {
  cacheKey: string;
  env: NodeJS.ProcessEnv;
}

export class BuildTaskService {
  private static instance: BuildTaskService;
  private static readonly DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
  private static readonly ENV_EXPORT_TIMEOUT_MS = 120_000;
  private static readonly MAX_RECENT_LOGS = 30;
  private static readonly MAX_VIEW_LOGS = 5000;
  private static readonly MAX_TASKS = 50;

  private readonly configService: ConfigService;
  private readonly sdkService: SdkService;
  private readonly logService: LogService;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly tasks = new Map<string, BuildTaskRecord>();
  private readonly viewLogs: BuildTaskViewLogEntry[] = [];
  private readonly queue: QueuedTask[] = [];
  private readonly _onDidChangeTasks = new vscode.EventEmitter<BuildTaskChangeEvent>();
  private cachedEnvironment?: CachedEnvironment;
  private running = false;
  private viewLogSequence = 0;

  public readonly onDidChangeTasks = this._onDidChangeTasks.event;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.sdkService = SdkService.getInstance();
    this.logService = LogService.getInstance();
    this.outputChannel = vscode.window.createOutputChannel('SiFli Build Tasks');
  }

  public static getInstance(): BuildTaskService {
    if (!BuildTaskService.instance) {
      BuildTaskService.instance = new BuildTaskService();
    }
    return BuildTaskService.instance;
  }

  public getOutputChannel(): vscode.OutputChannel {
    return this.outputChannel;
  }

  public getTasks(): BuildTaskRecord[] {
    return Array.from(this.tasks.values()).sort((left, right) => right.queuedAt.localeCompare(left.queuedAt));
  }

  public getViewLogs(): BuildTaskViewLogEntry[] {
    return [...this.viewLogs];
  }

  public getViewLogCount(): number {
    return this.viewLogs.length;
  }

  public showLogs(): void {
    this.revealLogView();
  }

  public revealLogView(): void {
    void vscode.commands.executeCommand('sifliBuildTasks.focus');
  }

  public refresh(): void {
    this.fireTaskStateChanged();
  }

  public clearFinishedTasks(): void {
    const removedTaskIds = new Set<string>();
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === 'succeeded' || task.status === 'failed') {
        this.tasks.delete(taskId);
        removedTaskIds.add(taskId);
      }
    }
    this.removeViewLogsForTasks(removedTaskIds);
    this.trimTaskHistory();
    this.fireLogsReset();
  }

  public clearLogs(): void {
    this.viewLogs.splice(0, this.viewLogs.length);
    for (const task of this.tasks.values()) {
      task.recentLogs.splice(0, task.recentLogs.length);
    }
    this.outputChannel.clear();
    this.fireLogsReset();
  }

  public async runShellTask(options: RunShellTaskOptions): Promise<RunTaskResult> {
    const waitForExit = options.waitForExit ?? true;
    const task = this.createTask(options.taskName, options.title ?? options.taskName, options.commandLine, options.cwd);
    this.appendTaskLog(task.id, `Queued: ${options.commandLine}`);

    const completion = new Promise<number | undefined>((resolve, reject) => {
      this.queue.push({ task, options, resolve, reject });
      this.fireTaskStateChanged();
      this.drainQueue();
    });

    if (!waitForExit) {
      completion.catch(error => {
        this.logService.error(`Background task failed after non-waiting launch: ${task.title}`, error);
      });
      return {
        taskId: task.id,
        background: true,
      };
    }

    const exitCode = await completion;
    return {
      taskId: task.id,
      exitCode,
      background: false,
    };
  }

  public async recordInstantTask(
    taskName: TaskName,
    title: string,
    executor: (log: (message: string, level?: BuildTaskLogEntry['level']) => void) => void | Promise<void>
  ): Promise<BuildTaskRecord> {
    const task = this.createTask(taskName, title);
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    this.fireTaskStateChanged();

    try {
      await executor((message, level = 'info') => this.appendTaskLog(task.id, message, level));
      this.finishTask(task.id, 'succeeded', 0);
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.appendTaskLog(task.id, message, 'error');
      this.finishTask(task.id, 'failed', undefined, message);
    }

    return task;
  }

  public recordInstantTaskSync(
    taskName: TaskName,
    title: string,
    executor: (log: (message: string, level?: BuildTaskLogEntry['level']) => void) => void
  ): BuildTaskRecord {
    const task = this.createTask(taskName, title);
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    this.fireTaskStateChanged();

    try {
      executor((message, level = 'info') => this.appendTaskLog(task.id, message, level));
      this.finishTask(task.id, 'succeeded', 0);
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.appendTaskLog(task.id, message, 'error');
      this.finishTask(task.id, 'failed', undefined, message);
    }

    return task;
  }

  private createTask(taskName: TaskName, title: string, command?: string, cwd?: string): BuildTaskRecord {
    const task: BuildTaskRecord = {
      id: `build-task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      taskName,
      title,
      command,
      cwd,
      status: 'queued',
      queuedAt: new Date().toISOString(),
      recentLogs: [],
    };
    this.tasks.set(task.id, task);
    this.trimTaskHistory();
    this.revealLogView();
    this.fireTaskStateChanged();
    return task;
  }

  private drainQueue(): void {
    if (this.running) {
      return;
    }

    const queued = this.queue.shift();
    if (!queued) {
      return;
    }

    this.running = true;
    void this.executeQueuedTask(queued)
      .catch(error => {
        queued.reject(error instanceof Error ? error : new Error(String(error)));
      })
      .finally(() => {
        this.running = false;
        this.drainQueue();
      });
  }

  private async executeQueuedTask(queued: QueuedTask): Promise<void> {
    const { task, options } = queued;
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    this.fireTaskStateChanged();

    try {
      const cwd = options.cwd ?? this.resolveProjectCwd();
      task.cwd = cwd;
      this.appendTaskLog(task.id, `Working directory: ${cwd}`);
      if (options.runId) {
        this.appendTaskLog(task.id, `Run ID: ${options.runId}`);
      }
      this.appendTaskLog(task.id, `Command: ${options.commandLine}`);

      const env = await this.resolveEnvironment(cwd, task.id);
      const exitCode = await this.spawnShellCommand(task.id, options.commandLine, cwd, env, options.timeoutMs);
      this.finishTask(task.id, exitCode === 0 ? 'succeeded' : 'failed', exitCode);
      queued.resolve(exitCode);
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.appendTaskLog(task.id, message, 'error');
      this.finishTask(task.id, 'failed', undefined, message);
      queued.reject(error instanceof Error ? error : new Error(message));
    }
  }

  private resolveProjectCwd(): string {
    const projectInfo = getProjectInfo();
    if (projectInfo?.projectEntryPath) {
      return projectInfo.projectEntryPath;
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return workspaceFolder.uri.fsPath;
    }
    return process.cwd();
  }

  private async resolveEnvironment(cwd: string, taskId: string): Promise<NodeJS.ProcessEnv> {
    const baseEnv = { ...process.env };
    if (process.platform === 'win32') {
      WindowsManagedEnvService.getInstance().applyInstallScriptEnvironment(baseEnv);
    } else {
      this.prependPath(baseEnv, ProbeRsService.getInstance().getManagedExecutableDir());
    }

    const sdkPath = this.configService.getCurrentSdkPath() || this.configService.getCurrentSdk()?.path;
    const exportScriptPath = sdkPath ? this.sdkService.getExportScriptPath(sdkPath) : undefined;
    const toolsPath = sdkPath ? this.configService.getSdkToolsPath(sdkPath) : undefined;
    if (toolsPath && toolsPath.trim() !== '') {
      baseEnv.SIFLI_SDK_TOOLS_PATH = toolsPath.trim();
    }

    const cacheKey = [
      sdkPath ?? '',
      exportScriptPath ?? '',
      exportScriptPath ? this.getFileMtimeKey(exportScriptPath) : '',
      toolsPath ?? '',
      process.platform,
    ].join('|');
    if (this.cachedEnvironment?.cacheKey === cacheKey) {
      this.appendTaskLog(taskId, vscode.l10n.t('Using cached SiFli SDK environment.'));
      return { ...this.cachedEnvironment.env };
    }

    if (!exportScriptPath) {
      this.appendTaskLog(
        taskId,
        vscode.l10n.t('No SDK export script found. Using current process environment.'),
        'warn'
      );
      this.cachedEnvironment = { cacheKey, env: { ...baseEnv } };
      return { ...baseEnv };
    }

    this.appendTaskLog(taskId, vscode.l10n.t('Preparing SiFli SDK environment: {0}', exportScriptPath));
    const exportedEnv = await this.exportEnvironment(exportScriptPath, cwd, baseEnv, taskId);
    this.cachedEnvironment = { cacheKey, env: { ...exportedEnv } };
    return { ...exportedEnv };
  }

  private exportEnvironment(
    exportScriptPath: string,
    cwd: string,
    env: NodeJS.ProcessEnv,
    taskId: string
  ): Promise<NodeJS.ProcessEnv> {
    return new Promise((resolve, reject) => {
      const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codekit-build-env-'));
      const outputPath = path.join(outputDir, 'environment.json');
      const invocation = this.buildExportShellInvocation(exportScriptPath, outputPath);
      const child = spawn(invocation.command, invocation.args, {
        cwd,
        env,
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const cleanup = () => {
        try {
          fs.rmSync(outputDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup failures.
        }
      };

      const finish = (handler: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        cleanup();
        handler();
      };

      const timeout = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // Ignore kill failures.
        }
        finish(() => reject(new Error(vscode.l10n.t('SDK environment export timed out.'))));
      }, BuildTaskService.ENV_EXPORT_TIMEOUT_MS);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', error => {
        finish(() => reject(error));
      });
      child.on('close', code => {
        if (settled) {
          return;
        }
        if (code !== 0) {
          const message = stderr.trim() || stdout.trim() || `SDK export exited with code ${String(code)}`;
          finish(() => reject(new Error(message)));
          return;
        }
        try {
          const exportedEnv = parseExportedEnvironmentFile(outputPath);
          if (stderr.trim()) {
            this.appendTaskLog(taskId, stderr.trim(), 'warn');
          }
          finish(() => resolve(exportedEnv));
        } catch (error) {
          const parseMessage = this.getErrorMessage(error);
          const shellOutput = [stderr.trim(), stdout.trim()].filter(Boolean).join(os.EOL);
          finish(() =>
            reject(
              new Error(
                `Failed to parse exported SDK environment: ${parseMessage}${shellOutput ? `${os.EOL}${shellOutput}` : ''}`
              )
            )
          );
        }
      });
    });
  }

  private buildExportShellInvocation(
    exportScriptPath: string,
    exportedEnvironmentPath: string
  ): { command: string; args: string[] } {
    const pythonSnippet = buildExportedEnvironmentPythonSnippet(exportedEnvironmentPath);
    if (process.platform === 'win32') {
      const powerShell = resolvePowerShellExecutable(this.configService.config.powershellPath).executablePath;
      const envJsonCommand = `python -c ${quotePowerShellString(pythonSnippet)}`;
      const command = [
        '$ErrorActionPreference = "Stop"',
        buildPowerShellDotSourceCommandWithOutputToError(exportScriptPath),
        envJsonCommand,
        'exit $LASTEXITCODE',
      ].join('; ');
      return {
        command: powerShell,
        args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      };
    }

    const shellPath = process.env.SHELL || '/bin/sh';
    const shellName = path.basename(shellPath);
    const args = shellName === 'bash' || shellName === 'zsh' ? ['-l', '-c'] : ['-c'];
    const envJsonCommand = `python -c ${this.shellQuote(pythonSnippet)}`;
    const command = ['set -e', `. ${this.shellQuote(exportScriptPath)} 1>&2`, envJsonCommand].join('; ');
    return {
      command: shellPath,
      args: [...args, command],
    };
  }

  private spawnShellCommand(
    taskId: string,
    commandLine: string,
    cwd: string,
    env: NodeJS.ProcessEnv,
    timeoutMs = BuildTaskService.DEFAULT_TIMEOUT_MS
  ): Promise<number | undefined> {
    return new Promise((resolve, reject) => {
      const invocation = this.buildShellInvocation(commandLine);
      const child = spawn(invocation.command, invocation.args, {
        cwd,
        env,
        windowsHide: true,
      });
      let settled = false;
      let timedOut = false;
      const stdoutEmitter = this.createLineEmitter(line => this.appendTaskLog(taskId, line));
      const stderrEmitter = this.createLineEmitter(line => this.appendTaskLog(taskId, line, 'warn'));

      const finish = (handler: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        stdoutEmitter.flush();
        stderrEmitter.flush();
        handler();
      };

      const timeout = setTimeout(() => {
        timedOut = true;
        try {
          child.kill();
        } catch {
          // Ignore kill failures.
        }
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => stdoutEmitter.push(chunk.toString()));
      child.stderr?.on('data', (chunk: Buffer) => stderrEmitter.push(chunk.toString()));
      child.on('error', error => {
        finish(() => reject(error));
      });
      child.on('close', code => {
        finish(() => {
          if (timedOut) {
            reject(
              new Error(vscode.l10n.t('Command timed out after {0} seconds.', String(Math.round(timeoutMs / 1000))))
            );
            return;
          }
          resolve(code ?? undefined);
        });
      });
    });
  }

  private buildShellInvocation(commandLine: string): { command: string; args: string[] } {
    if (process.platform === 'win32') {
      const powerShell = resolvePowerShellExecutable(this.configService.config.powershellPath).executablePath;
      return {
        command: powerShell,
        args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', commandLine],
      };
    }

    const shellPath = process.env.SHELL || '/bin/sh';
    const shellName = path.basename(shellPath);
    const args = shellName === 'bash' || shellName === 'zsh' ? ['-l', '-c'] : ['-c'];
    return {
      command: shellPath,
      args: [...args, commandLine],
    };
  }

  private finishTask(taskId: string, status: BuildTaskStatus, exitCode?: number, error?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }
    task.status = status;
    task.finishedAt = new Date().toISOString();
    task.exitCode = exitCode;
    task.error = error;
    const exitText =
      exitCode === undefined ? vscode.l10n.t('no exit code') : vscode.l10n.t('exit code {0}', String(exitCode));
    this.appendTaskLog(
      taskId,
      vscode.l10n.t('{0} finished with {1}.', task.title, exitText),
      status === 'failed' ? 'error' : 'info'
    );
    this.fireTaskStateChanged();
  }

  private appendTaskLog(taskId: string, message: string, level: BuildTaskLogEntry['level'] = 'info'): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }
    const entry: BuildTaskLogEntry = {
      ts: new Date().toISOString(),
      level,
      message,
    };
    task.recentLogs.push(entry);
    if (task.recentLogs.length > BuildTaskService.MAX_RECENT_LOGS) {
      task.recentLogs.splice(0, task.recentLogs.length - BuildTaskService.MAX_RECENT_LOGS);
    }
    const viewEntry = this.appendViewLog(task, entry);
    this.writeOutputLine(entry);
    this.fireLogsAppended([viewEntry]);
  }

  private appendViewLog(task: BuildTaskRecord, entry: BuildTaskLogEntry): BuildTaskViewLogEntry {
    const viewEntry: BuildTaskViewLogEntry = {
      ...entry,
      id: `build-task-log-${this.viewLogSequence++}`,
      taskId: task.id,
      taskTitle: task.title,
    };
    this.viewLogs.push(viewEntry);
    if (this.viewLogs.length > BuildTaskService.MAX_VIEW_LOGS) {
      this.viewLogs.splice(0, this.viewLogs.length - BuildTaskService.MAX_VIEW_LOGS);
    }
    return viewEntry;
  }

  private removeViewLogsForTasks(taskIds: Set<string>): void {
    if (taskIds.size === 0) {
      return;
    }
    for (let index = this.viewLogs.length - 1; index >= 0; index--) {
      if (taskIds.has(this.viewLogs[index].taskId)) {
        this.viewLogs.splice(index, 1);
      }
    }
  }

  private writeOutputLine(entry: BuildTaskLogEntry): void {
    this.outputChannel.appendLine(entry.message);
  }

  private fireTaskStateChanged(): void {
    this._onDidChangeTasks.fire({ type: 'state' });
  }

  private fireLogsAppended(logs: BuildTaskViewLogEntry[]): void {
    this._onDidChangeTasks.fire({ type: 'logs', logs });
  }

  private fireLogsReset(): void {
    this._onDidChangeTasks.fire({ type: 'reset' });
  }

  private createLineEmitter(onLine: (line: string) => void): { push(chunk: string): void; flush(): void } {
    let buffer = '';
    return {
      push(chunk: string) {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        lines.filter(line => line.length > 0).forEach(onLine);
      },
      flush() {
        if (buffer.length > 0) {
          onLine(buffer);
          buffer = '';
        }
      },
    };
  }

  private prependPath(env: NodeJS.ProcessEnv, entry: string | undefined): void {
    if (!entry) {
      return;
    }
    const currentPath = env.PATH || env.Path || '';
    const nextPath = currentPath ? `${entry}${path.delimiter}${currentPath}` : entry;
    env.PATH = nextPath;
    if (Object.prototype.hasOwnProperty.call(env, 'Path')) {
      env.Path = nextPath;
    }
  }

  private trimTaskHistory(): void {
    const removable = this.getTasks().filter(task => task.status === 'succeeded' || task.status === 'failed');
    while (this.tasks.size > BuildTaskService.MAX_TASKS && removable.length > 0) {
      const oldest = removable.pop();
      if (!oldest) {
        break;
      }
      this.tasks.delete(oldest.id);
      this.removeViewLogsForTasks(new Set([oldest.id]));
    }
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  private getFileMtimeKey(filePath: string): string {
    try {
      return String(fs.statSync(filePath).mtimeMs);
    } catch {
      return '';
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export const BACKGROUND_TASK_NAMES = TASK_NAMES;
