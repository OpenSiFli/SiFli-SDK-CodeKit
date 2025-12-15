import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { TERMINAL_NAME, PROJECT_SUBFOLDER } from '../constants';
import { TaskName } from '../types';
import { ConfigService } from './configService';
import { LogService } from './logService';
import { PythonService } from './pythonService';
import { MinGitService } from './minGitService';

export class TerminalService {
  private static instance: TerminalService;
  private configService: ConfigService;
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
    this.logService = LogService.getInstance();
    this.terminalCloseListener = vscode.window.onDidCloseTerminal(terminal => {
      if (terminal.name === TERMINAL_NAME) {
        if (terminal === this.currentTerminal) {
          this.currentTerminal = undefined;
        }
      }
    });
  }

  public static getInstance(): TerminalService {
    if (!TerminalService.instance) {
      TerminalService.instance = new TerminalService();
    }
    return TerminalService.instance;
  }

  /**
   * 获取 PowerShell 可执行文件路径
   */
  private getPowerShellPath(): string {
    if (process.platform !== 'win32') {
      return 'powershell.exe'; // 非 Windows 平台返回默认值（实际不会使用）
    }
    
    const configuredPath = this.configService.config.powershellPath;
    return configuredPath && configuredPath.trim() !== '' ? configuredPath : 'powershell.exe';
  }

  /**
   * 获取或创建 SiFli 终端并切换到项目目录
   */
  public async getOrCreateSiFliTerminalAndCdProject(
    forceNew = false,
    options?: { autoExport?: boolean }
  ): Promise<vscode.Terminal> {
    let terminal = forceNew ? undefined : this.findSiFliTerminal();
    const configuredScriptPath = this.configService.getSifliSdkExportScriptPath();
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
      const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);
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
      name: TERMINAL_NAME
    };

    // 在 Windows 平台强制使用 PowerShell
    if (process.platform === 'win32') {
      const shellPath = this.getPowerShellPath();
      terminalOptions.shellPath = shellPath;
      this.logService.debug(`Creating Windows terminal with PowerShell: ${shellPath}`);
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
    await this.setupPythonEnvironment(terminal);
    await this.setupGitEnvironment(terminal);
    this.envInjectedTerminals.add(terminal);
  }

  /**
   * 根据配置执行导出脚本，确保当前终端拥有 SDK 环境
   */
  private async runExportScriptIfNeeded(
    terminal: vscode.Terminal,
    scriptPath: string | undefined
  ): Promise<void> {
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

  /**
   * 设置 Python 环境 (仅限 Windows)
   */
  private async setupPythonEnvironment(terminal: vscode.Terminal): Promise<void> {
    if (process.platform !== 'win32') {
      return;
    }
    const pythonService = PythonService.getInstance();
    const pythonDir = pythonService.getPythonDir();
    
    if (!pythonDir) {
      this.logService.debug('Embedded Python not available; skipping PATH injection.');
      return;
    }

    const scriptsPath = path.join(pythonDir, 'Scripts');
    this.logService.info(`Injecting embedded Python path: ${pythonDir}; Scripts: ${scriptsPath}`);
    // 将 Python 及 Scripts 路径添加到 PATH 的最前面
    terminal.sendText(`$env:Path = "${pythonDir};${scriptsPath};" + $env:Path`);
  }

  /**
   * 设置 MinGit 环境 (仅限 Windows)
   */
  private async setupGitEnvironment(terminal: vscode.Terminal): Promise<void> {
    if (process.platform !== 'win32') {
      return;
    }
    const minGitService = MinGitService.getInstance();
    const gitCmdDir = minGitService.getGitCmdDir();
    if (!gitCmdDir) {
      this.logService.debug('MinGit path unavailable; skipping PATH injection.');
      return;
    }

    this.logService.info(`Injecting MinGit path: ${gitCmdDir}`);
    terminal.sendText(`$env:Path = "${gitCmdDir};" + $env:Path`);
  }

  /**
   * 获取 PowerShell 可执行文件路径（公共方法）
   */
  public getPowerShellExecutablePath(): string {
    return this.getPowerShellPath();
  }

  /**
   * 标记当前终端环境已完成 SDK 导出
   */
  public markSdkEnvironmentPrepared(): void {
    const configuredScriptPath = this.configService.getSifliSdkExportScriptPath();
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
    options?: { waitForExit?: boolean }
  ): Promise<number | undefined> {
    try {
      this.logService.info(`Executing ${taskName}: ${commandLine}`);

      const terminal = await this.getOrCreateSiFliTerminalAndCdProject();
      terminal.show();

      const configuredScriptPath = this.configService.getSifliSdkExportScriptPath();
      const scriptPath =
        configuredScriptPath && configuredScriptPath.trim() !== '' ? configuredScriptPath.trim() : undefined;
      const needsEnvSetup = !!scriptPath && !this.isExportPrepared(terminal, scriptPath);

      if (!options?.waitForExit) {
        const commandToSend = this.buildCommandForTerminal(commandLine, scriptPath, needsEnvSetup);
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
        exitMarkerPath
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
    exitMarkerPath?: string
  ): string {
    const effectiveScriptPath = includeEnvSetup ? scriptPath : undefined;
    if (process.platform === 'win32') {
      return this.buildPowerShellCommand(commandLine, effectiveScriptPath, exitMarkerPath);
    }
    return this.buildUnixShellCommand(commandLine, effectiveScriptPath, exitMarkerPath);
  }

  private buildPowerShellCommand(
    commandLine: string,
    exportScriptPath?: string,
    exitMarkerPath?: string
  ): string {
    if (exitMarkerPath) {
      const commands: string[] = [];
      if (exportScriptPath) {
        const escapedScript = exportScriptPath.replace(/"/g, '""');
        commands.push(`& "${escapedScript}"`);
        commands.push(`$sifli_command_exit = $LASTEXITCODE`);
        commands.push(`if ($sifli_command_exit -eq 0) { ${commandLine}; $sifli_command_exit = $LASTEXITCODE }`);
      } else {
        commands.push(`${commandLine}`);
        commands.push(`$sifli_command_exit = $LASTEXITCODE`);
      }
      const escapedMarker = exitMarkerPath.replace(/"/g, '""');
      commands.push(`Set-Content -Path "${escapedMarker}" -Value $sifli_command_exit -NoNewline`);
      return commands.join('; ');
    }

    if (exportScriptPath) {
      const escapedScript = exportScriptPath.replace(/"/g, '""');
      return `& "${escapedScript}"; if ($LASTEXITCODE -eq 0) { ${commandLine} }`;
    }

    return commandLine;
  }

  private buildUnixShellCommand(
    commandLine: string,
    exportScriptPath?: string,
    exitMarkerPath?: string
  ): string {
    if (exitMarkerPath) {
      const escapedMarker = exitMarkerPath.replace(/(["\\$`])/g, '\\$1');
      if (exportScriptPath) {
        const escapedScript = exportScriptPath.replace(/(["\\$`])/g, '\\$1');
        return `. "${escapedScript}"; sifli_exit=$?; if [ $sifli_exit -eq 0 ]; then ${commandLine}; sifli_exit=$?; fi; printf "%s" "$sifli_exit" > "${escapedMarker}"`;
      }
      return `${commandLine}; sifli_exit=$?; printf "%s" "$sifli_exit" > "${escapedMarker}"`;
    }

    if (exportScriptPath) {
      const escapedScript = exportScriptPath.replace(/(["\\$`])/g, '\\$1');
      return `. "${escapedScript}" && ${commandLine}`;
    }

    return commandLine;
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
