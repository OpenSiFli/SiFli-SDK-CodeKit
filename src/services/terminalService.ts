import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { TERMINAL_NAME } from '../constants';
import { TaskName } from '../types';
import { ConfigService } from './configService';
import { LogService } from './logService';
import { ProbeRsService } from './probeRsService';
import { SdkService } from './sdkService';
import { WindowsManagedEnvService } from './windowsManagedEnvService';
import { getProjectInfo } from '../utils/projectUtils';
import { ResolvedPowerShellExecutable, resolvePowerShellExecutable } from '../utils/powerShellUtils';

export class TerminalService {
  private static instance: TerminalService;
  private configService: ConfigService;
  private _sdkService: SdkService | null = null;
  private logService: LogService;
  private currentTerminal?: vscode.Terminal;
  private terminalCloseListener: vscode.Disposable;
  private envInjectedTerminals = new WeakSet<vscode.Terminal>();
  private exportPrepared = new WeakMap<vscode.Terminal, string | null>();
  private lastExportScriptPath?: string;
  private static readonly EXIT_CODE_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟超时
  private static readonly EXIT_CODE_POLL_INTERVAL_MS = 500;

  private constructor() {
    this.configService = ConfigService.getInstance();
    // 注意：不能在这里获取 SdkService，因为会导致循环依赖
    // SdkService 在构造函数中也会获取 TerminalService
    this.logService = LogService.getInstance();
    this.terminalCloseListener = vscode.window.onDidCloseTerminal(terminal => {
      if (terminal.name === TERMINAL_NAME) {
        if (terminal === this.currentTerminal) {
          this.currentTerminal = undefined;
        }
      }
    });
  }

  /**
   * 延迟获取 SdkService，避免循环依赖
   */
  private get sdkService(): SdkService {
    if (!this._sdkService) {
      this._sdkService = SdkService.getInstance();
    }
    return this._sdkService;
  }

  public static getInstance(): TerminalService {
    if (!TerminalService.instance) {
      TerminalService.instance = new TerminalService();
    }
    return TerminalService.instance;
  }

  /**
   * 获取或创建 SiFli 终端并切换到项目目录
   */
  public async getOrCreateSiFliTerminalAndCdProject(
    forceNew = false,
    options?: { autoExport?: boolean }
  ): Promise<vscode.Terminal> {
    let terminal = forceNew ? undefined : this.findSiFliTerminal();
    const configuredScriptPath = this.sdkService.getExportScriptPath();
    const normalizedScriptPath =
      configuredScriptPath && configuredScriptPath.trim() !== '' ? configuredScriptPath.trim() : undefined;
    if (!terminal) {
      this.logService.info('Creating new SiFli terminal');
      terminal = this.createSiFliTerminal();
    } else {
      this.logService.debug('Reusing existing SiFli terminal');
    }

    this.currentTerminal = terminal;

    if (normalizedScriptPath !== this.lastExportScriptPath) {
      this.lastExportScriptPath = normalizedScriptPath;
      // 导出脚本变更时，重置各终端的已准备状态
      this.exportPrepared = new WeakMap();
    }

    await this.ensureEnvInjected(terminal);
    if (options?.autoExport !== false) {
      await this.runExportScriptIfNeeded(terminal, normalizedScriptPath);
    }

    // 切换到项目目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const projectInfo = getProjectInfo();
      const projectPath = projectInfo?.projectEntryPath;
      if (!projectPath) {
        this.logService.error('[[terminalService] Project entry path not found');
        return terminal;
      }
      terminal.sendText(`cd "${projectPath}"`);
      this.logService.debug(`Changed terminal directory to: ${projectPath}`);
    }

    return terminal;
  }

  /**
   * 查找现有的 SiFli 终端
   */
  private findSiFliTerminal(): vscode.Terminal | undefined {
    return vscode.window.terminals.find(terminal => terminal.name === TERMINAL_NAME);
  }

  /**
   * 创建新的 SiFli 终端
   */
  private createSiFliTerminal(): vscode.Terminal {
    // 根据平台设置终端配置
    const terminalOptions: vscode.TerminalOptions = {
      name: TERMINAL_NAME,
    };

    // 在 Windows 平台强制使用 PowerShell
    if (process.platform === 'win32') {
      const shellInfo = this.getPowerShellExecutableInfo();
      terminalOptions.shellPath = shellInfo.executablePath;
      this.logService.debug(
        `Creating Windows terminal with PowerShell (${shellInfo.kind}, ${shellInfo.source}): ${shellInfo.executablePath}`
      );
    } else {
      // macOS 和 Linux 使用默认 shell
      this.logService.debug(`Creating terminal with default shell on ${process.platform}`);
    }

    return vscode.window.createTerminal(terminalOptions);
  }

  /**
   * 确保当前终端完成环境注入（仅在未注入过时执行）
   */
  private async ensureEnvInjected(terminal: vscode.Terminal): Promise<void> {
    if (this.envInjectedTerminals.has(terminal)) {
      return;
    }
    if (process.platform === 'win32') {
      await this.setupManagedWindowsEnvironment(terminal);
    } else {
      await this.setupProbeRsEnvironment(terminal);
    }
    this.envInjectedTerminals.add(terminal);
  }

  /**
   * 根据配置执行导出脚本，确保当前终端拥有 SDK 环境
   */
  private async runExportScriptIfNeeded(terminal: vscode.Terminal, scriptPath: string | undefined): Promise<void> {
    if (!scriptPath) {
      this.markExportPrepared(terminal, null);
      return;
    }

    if (this.isExportPrepared(terminal, scriptPath)) {
      return;
    }

    let executeCommand: string;
    if (process.platform === 'win32') {
      executeCommand = `& "${scriptPath}"`;
    } else {
      executeCommand = `. "${scriptPath}"`;
    }

    this.logService.info(`Running SDK export script in terminal: ${scriptPath}`);
    terminal.sendText(executeCommand);
    this.markExportPrepared(terminal, scriptPath);
  }

  private isExportPrepared(terminal: vscode.Terminal, scriptPath: string | undefined): boolean {
    const preparedFor = this.exportPrepared.get(terminal);
    if (!scriptPath) {
      return preparedFor === null;
    }
    return preparedFor === scriptPath;
  }

  private markExportPrepared(terminal: vscode.Terminal, scriptPath: string | null): void {
    this.exportPrepared.set(terminal, scriptPath);
  }

  private async setupManagedWindowsEnvironment(terminal: vscode.Terminal): Promise<void> {
    const envService = WindowsManagedEnvService.getInstance();
    const pathEntries = envService.buildTerminalPathEntries();
    if (pathEntries.length === 0) {
      this.logService.debug('Managed Windows tool paths unavailable; skipping PATH injection.');
      return;
    }

    const pathCommand = envService.buildTerminalPathCommand(pathEntries);
    if (!pathCommand) {
      this.logService.debug('Managed Windows PATH command is empty; skipping PATH injection.');
      return;
    }

    this.logService.info(`Injecting managed Windows tool paths: ${pathEntries.join(';')}`);
    terminal.sendText(pathCommand);
  }

  /**
   * 设置 probe-rs 环境
   */
  private async setupProbeRsEnvironment(terminal: vscode.Terminal): Promise<void> {
    const probeRsDir = ProbeRsService.getInstance().getManagedExecutableDir();
    if (!probeRsDir) {
      this.logService.debug('Managed probe-rs not available; skipping PATH injection.');
      return;
    }

    this.logService.info(`Injecting managed probe-rs path: ${probeRsDir}`);
    if (process.platform === 'win32') {
      terminal.sendText(`$env:Path = "${probeRsDir};" + $env:Path`);
    } else {
      terminal.sendText(`export PATH="${probeRsDir}:$PATH"`);
    }
  }

  /**
   * 获取 PowerShell 可执行文件信息（公共方法）
   */
  public getPowerShellExecutableInfo(): ResolvedPowerShellExecutable {
    return resolvePowerShellExecutable(this.configService.config.powershellPath);
  }

  /**
   * 获取 PowerShell 可执行文件路径（公共方法）
   */
  public getPowerShellExecutablePath(): string {
    return this.getPowerShellExecutableInfo().executablePath;
  }

  /**
   * 标记当前终端环境已完成 SDK 导出
   */
  public markSdkEnvironmentPrepared(): void {
    const configuredScriptPath = this.sdkService.getExportScriptPath();
    const normalizedScriptPath =
      configuredScriptPath && configuredScriptPath.trim() !== '' ? configuredScriptPath.trim() : undefined;
    this.lastExportScriptPath = normalizedScriptPath;
    if (this.currentTerminal) {
      this.markExportPrepared(this.currentTerminal, normalizedScriptPath ?? null);
    }
  }

  /**
   * 在 SiFli 终端中执行命令
   */
  public async executeShellCommandInSiFliTerminal(
    commandLine: string,
    taskName: TaskName,
    options?: { waitForExit?: boolean; runId?: string }
  ): Promise<number | undefined> {
    try {
      this.logService.info(`Executing ${taskName}: ${commandLine}`);

      const terminal = await this.getOrCreateSiFliTerminalAndCdProject();
      terminal.show();

      const configuredScriptPath = this.sdkService.getExportScriptPath();
      const scriptPath =
        configuredScriptPath && configuredScriptPath.trim() !== '' ? configuredScriptPath.trim() : undefined;
      const needsEnvSetup = !!scriptPath && !this.isExportPrepared(terminal, scriptPath);

      if (!options?.waitForExit) {
        const commandToSend = this.buildCommandForTerminal(
          commandLine,
          scriptPath,
          needsEnvSetup,
          undefined,
          taskName,
          options?.runId
        );
        terminal.sendText(commandToSend);
        if (needsEnvSetup) {
          this.markExportPrepared(terminal, scriptPath ?? null);
        } else if (!scriptPath) {
          this.markExportPrepared(terminal, null);
        }
        this.logService.info(`Successfully forwarded ${taskName} to terminal`);
        return undefined;
      }

      const exitMarkerPath = this.buildExitMarkerPath(taskName);
      await this.ensureExitMarkerRemoved(exitMarkerPath);

      const commandWithTracking = this.buildCommandForTerminal(
        commandLine,
        scriptPath,
        needsEnvSetup,
        exitMarkerPath,
        taskName,
        options?.runId
      );
      terminal.sendText(commandWithTracking);

      let exitCode: number | undefined;
      try {
        exitCode = await this.waitForExitCode(exitMarkerPath);
      } finally {
        await this.ensureExitMarkerRemoved(exitMarkerPath);
      }

      if (needsEnvSetup && exitCode === 0) {
        this.markExportPrepared(terminal, scriptPath ?? null);
      } else if (!scriptPath) {
        this.markExportPrepared(terminal, null);
      }

      this.logService.info(`${taskName} finished with exit code ${exitCode}`);
      return exitCode;
    } catch (error) {
      this.logService.error(`Error executing ${taskName}:`, error);
      throw error;
    }
  }
  private buildExitMarkerPath(taskName: TaskName): string {
    const sanitizedName = taskName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return path.join(os.tmpdir(), `sifli-${sanitizedName}-${randomUUID()}.code`);
  }

  private buildCommandForTerminal(
    commandLine: string,
    scriptPath: string | undefined,
    includeEnvSetup: boolean,
    exitMarkerPath?: string,
    taskName?: TaskName,
    runId?: string
  ): string {
    const effectiveScriptPath = includeEnvSetup ? scriptPath : undefined;
    if (process.platform === 'win32') {
      return this.buildPowerShellCommand(commandLine, effectiveScriptPath, exitMarkerPath, taskName, runId);
    }
    return this.buildUnixShellCommand(commandLine, effectiveScriptPath, exitMarkerPath, taskName, runId);
  }

  private buildPowerShellCommand(
    commandLine: string,
    exportScriptPath?: string,
    exitMarkerPath?: string,
    taskName?: TaskName,
    runId?: string
  ): string {
    const markerStart = runId
      ? `Write-Host "${this.escapePowerShellString(this.buildRunMarker('START', taskName, runId))}"`
      : undefined;
    const markerEndPrefix = runId
      ? this.escapePowerShellString(this.buildRunMarker('END', taskName, runId))
      : undefined;

    if (exitMarkerPath) {
      const commands: string[] = [];
      if (markerStart) {
        commands.push(markerStart);
      }
      if (exportScriptPath) {
        const escapedScript = exportScriptPath.replace(/"/g, '""');
        commands.push(`& "${escapedScript}"`);
        commands.push(`$sifli_command_exit = $LASTEXITCODE`);
        commands.push(`if ($sifli_command_exit -eq 0) { ${commandLine}; $sifli_command_exit = $LASTEXITCODE }`);
      } else {
        commands.push(`${commandLine}`);
        commands.push(`$sifli_command_exit = $LASTEXITCODE`);
      }
      if (markerEndPrefix) {
        commands.push(`Write-Host "${markerEndPrefix} exit=$sifli_command_exit"`);
      }
      const escapedMarker = exitMarkerPath.replace(/"/g, '""');
      commands.push(`Set-Content -Path "${escapedMarker}" -Value $sifli_command_exit -NoNewline`);
      return commands.join('; ');
    }

    const commands: string[] = [];
    if (markerStart) {
      commands.push(markerStart);
    }
    if (exportScriptPath) {
      const escapedScript = exportScriptPath.replace(/"/g, '""');
      commands.push(`& "${escapedScript}"`);
      commands.push(`$sifli_command_exit = $LASTEXITCODE`);
      commands.push(`if ($sifli_command_exit -eq 0) { ${commandLine}; $sifli_command_exit = $LASTEXITCODE }`);
    } else {
      commands.push(`${commandLine}`);
      commands.push(`$sifli_command_exit = $LASTEXITCODE`);
    }
    if (markerEndPrefix) {
      commands.push(`Write-Host "${markerEndPrefix} exit=$sifli_command_exit"`);
    }
    return commands.join('; ');
  }

  private buildUnixShellCommand(
    commandLine: string,
    exportScriptPath?: string,
    exitMarkerPath?: string,
    taskName?: TaskName,
    runId?: string
  ): string {
    const markerStart = runId
      ? this.escapeUnixDoubleQuotedString(this.buildRunMarker('START', taskName, runId))
      : undefined;
    const markerEndPrefix = runId
      ? this.escapeUnixDoubleQuotedString(this.buildRunMarker('END', taskName, runId))
      : undefined;

    if (exitMarkerPath) {
      const escapedMarker = exitMarkerPath.replace(/(["\\$`])/g, '\\$1');
      const commands: string[] = [];
      if (markerStart) {
        commands.push(`printf '%s\\n' "${markerStart}"`);
      }
      if (exportScriptPath) {
        const escapedScript = exportScriptPath.replace(/(["\\$`])/g, '\\$1');
        commands.push(`. "${escapedScript}"`);
        commands.push(`sifli_exit=$?`);
        commands.push(`if [ $sifli_exit -eq 0 ]; then ${commandLine}; sifli_exit=$?; fi`);
      } else {
        commands.push(`${commandLine}`);
        commands.push(`sifli_exit=$?`);
      }
      if (markerEndPrefix) {
        commands.push(`printf '%s\\n' "${markerEndPrefix} exit=$sifli_exit"`);
      }
      commands.push(`printf "%s" "$sifli_exit" > "${escapedMarker}"`);
      return commands.join('; ');
    }

    const commands: string[] = [];
    if (markerStart) {
      commands.push(`printf '%s\\n' "${markerStart}"`);
    }
    if (exportScriptPath) {
      const escapedScript = exportScriptPath.replace(/(["\\$`])/g, '\\$1');
      commands.push(`. "${escapedScript}"`);
      commands.push(`sifli_exit=$?`);
      commands.push(`if [ $sifli_exit -eq 0 ]; then ${commandLine}; sifli_exit=$?; fi`);
    } else {
      commands.push(`${commandLine}`);
      commands.push(`sifli_exit=$?`);
    }
    if (markerEndPrefix) {
      commands.push(`printf '%s\\n' "${markerEndPrefix} exit=$sifli_exit"`);
    }
    return commands.join('; ');
  }

  private async waitForExitCode(exitMarkerPath: string): Promise<number | undefined> {
    const startTime = Date.now();

    while (true) {
      try {
        const content = await fs.promises.readFile(exitMarkerPath, 'utf8');
        const trimmed = content.trim();
        if (trimmed.length === 0) {
          throw new Error('Exit code marker file is empty');
        }

        const exitCode = Number.parseInt(trimmed, 10);
        if (Number.isNaN(exitCode)) {
          throw new Error(`无法解析退出码: ${trimmed}`);
        }
        return exitCode;
      } catch (error: any) {
        if (error && error.code !== 'ENOENT') {
          throw error;
        }

        if (Date.now() - startTime > TerminalService.EXIT_CODE_TIMEOUT_MS) {
          throw new Error('等待命令完成超时');
        }

        await this.delay(TerminalService.EXIT_CODE_POLL_INTERVAL_MS);
      }
    }
  }

  private async ensureExitMarkerRemoved(exitMarkerPath: string): Promise<void> {
    try {
      await fs.promises.rm(exitMarkerPath, { force: true });
    } catch (error) {
      this.logService.warn(`清理退出码临时文件失败: ${exitMarkerPath}`, error);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private buildRunMarker(phase: 'START' | 'END', taskName: TaskName | undefined, runId: string): string {
    const label = taskName ?? 'SiFli Command';
    return `[SiFli LM Tool][${runId}] ${phase} ${label}`;
  }

  private escapePowerShellString(value: string): string {
    return value.replace(/"/g, '""');
  }

  private escapeUnixDoubleQuotedString(value: string): string {
    return value.replace(/(["\\$`])/g, '\\$1');
  }

  /**
   * 清理所有 SiFli 终端
   */
  public disposeSiFliTerminals(): void {
    const sifliTerminals = vscode.window.terminals.filter(terminal => terminal.name === TERMINAL_NAME);
    if (sifliTerminals.length > 0) {
      this.logService.info(`Disposing ${sifliTerminals.length} SiFli terminal(s)`);
      sifliTerminals.forEach(terminal => terminal.dispose());
    }
    this.currentTerminal = undefined;
    this.exportPrepared = new WeakMap();
    this.lastExportScriptPath = undefined;
    this.envInjectedTerminals = new WeakSet();
  }

  /**
   * Dispose resources created by the terminal service.
   */
  public dispose(): void {
    this.terminalCloseListener.dispose();
  }
}
