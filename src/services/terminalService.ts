import * as vscode from 'vscode';
import * as path from 'path';
import { TERMINAL_NAME, PROJECT_SUBFOLDER } from '../constants';
import { TaskName } from '../types';
import { ConfigService } from './configService';

export class TerminalService {
  private static instance: TerminalService;
  private configService: ConfigService;

  private constructor() {
    this.configService = ConfigService.getInstance();
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
  public async getOrCreateSiFliTerminalAndCdProject(): Promise<vscode.Terminal> {
    let terminal = this.findSiFliTerminal();
    
    if (!terminal) {
      terminal = this.createSiFliTerminal();
    }

    // 切换到项目目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);
      terminal.sendText(`cd "${projectPath}"`);
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
    const currentSdk = this.configService.getCurrentSdk();
    let terminalOptions: vscode.TerminalOptions = {
      name: TERMINAL_NAME
    };

    // 如果有配置的 SDK 导出脚本，使用 PowerShell
    if (currentSdk?.path && this.configService.config.sifliSdkExportScriptPath) {
      if (process.platform === 'win32') {
        const powershellPath = this.configService.config.powershellPath || 'powershell';
        terminalOptions = {
          name: TERMINAL_NAME,
          shellPath: powershellPath,
          shellArgs: [
            '-NoExit',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `& "${this.configService.config.sifliSdkExportScriptPath}"`
          ]
        };
      } else {
        // macOS/Linux: 使用 source 命令
        const exportScript = this.configService.config.sifliSdkExportScriptPath.replace('.ps1', '.sh');
        terminalOptions.shellArgs = ['-c', `source "${exportScript}" && exec $SHELL`];
      }
    }

    return vscode.window.createTerminal(terminalOptions);
  }

  /**
   * 在 SiFli 终端中执行命令
   */
  public async executeShellCommandInSiFliTerminal(commandLine: string, taskName: TaskName): Promise<void> {
    try {
      const terminal = await this.getOrCreateSiFliTerminalAndCdProject();
      
      // 显示并聚焦终端
      terminal.show();
      
      // 发送命令
      terminal.sendText(commandLine);
      
      console.log(`[TerminalService] Executed ${taskName}: ${commandLine}`);
    } catch (error) {
      console.error(`[TerminalService] Error executing ${taskName}:`, error);
      vscode.window.showErrorMessage(`执行 ${taskName} 失败: ${error}`);
    }
  }

  /**
   * 清理所有 SiFli 终端
   */
  public disposeSiFliTerminals(): void {
    const sifliTerminals = vscode.window.terminals.filter(terminal => terminal.name === TERMINAL_NAME);
    sifliTerminals.forEach(terminal => terminal.dispose());
  }
}
