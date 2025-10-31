import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { TERMINAL_NAME, PROJECT_SUBFOLDER } from '../constants';
import { TaskName } from '../types';
import { ConfigService } from './configService';
import { LogService } from './logService';

export class TerminalService {
  private static instance: TerminalService;
  private configService: ConfigService;
  private logService: LogService;
  private static readonly EXIT_CODE_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟超时
  private static readonly EXIT_CODE_POLL_INTERVAL_MS = 500;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.logService = LogService.getInstance();
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
  public async getOrCreateSiFliTerminalAndCdProject(): Promise<vscode.Terminal> {
    let terminal = this.findSiFliTerminal();
    
    if (!terminal) {
      this.logService.info('Creating new SiFli terminal');
      terminal = this.createSiFliTerminal();
    } else {
      this.logService.debug('Reusing existing SiFli terminal');
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
   * 获取 PowerShell 可执行文件路径（公共方法）
   */
  public getPowerShellExecutablePath(): string {
    return this.getPowerShellPath();
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

      if (!options?.waitForExit) {
        terminal.sendText(commandLine);
        this.logService.info(`Successfully forwarded ${taskName} to terminal`);
        return undefined;
      }

      const exitMarkerPath = this.buildExitMarkerPath(taskName);
      await this.ensureExitMarkerRemoved(exitMarkerPath);

      const commandWithTracking = this.buildCommandWithExitTracking(commandLine, exitMarkerPath);
      terminal.sendText(commandWithTracking);

      let exitCode: number | undefined;
      try {
        exitCode = await this.waitForExitCode(exitMarkerPath);
      } finally {
        await this.ensureExitMarkerRemoved(exitMarkerPath);
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

  private buildCommandWithExitTracking(commandLine: string, exitMarkerPath: string): string {
    if (process.platform === 'win32') {
      const escapedPath = exitMarkerPath.replace(/"/g, '""');
      return `${commandLine}; $exitCode = $LASTEXITCODE; Set-Content -Path "${escapedPath}" -Value $exitCode -NoNewline`;
    }

    const escapedPath = exitMarkerPath.replace(/(["\\$`])/g, '\\$1');
    return `${commandLine}; exit_code=$?; printf "%s" "$exit_code" > "${escapedPath}"`;
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
  }
}
