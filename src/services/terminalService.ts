import * as vscode from 'vscode';
import * as path from 'path';
import { TERMINAL_NAME, PROJECT_SUBFOLDER } from '../constants';
import { TaskName } from '../types';
import { ConfigService } from './configService';
import { LogService } from './logService';

export class TerminalService {
  private static instance: TerminalService;
  private configService: ConfigService;
  private logService: LogService;

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
    // 创建一个普通的终端，SDK 激活通过 sdkService.activateSdk 方法来处理
    const terminalOptions: vscode.TerminalOptions = {
      name: TERMINAL_NAME
    };

    return vscode.window.createTerminal(terminalOptions);
  }

  /**
   * 在 SiFli 终端中执行命令
   */
  public async executeShellCommandInSiFliTerminal(commandLine: string, taskName: TaskName): Promise<void> {
    try {
      this.logService.info(`Executing ${taskName}: ${commandLine}`);
      const terminal = await this.getOrCreateSiFliTerminalAndCdProject();
      
      // 显示并聚焦终端
      terminal.show();
      
      // 发送命令
      terminal.sendText(commandLine);
      
      this.logService.info(`Successfully executed ${taskName}`);
    } catch (error) {
      this.logService.error(`Error executing ${taskName}:`, error);
      vscode.window.showErrorMessage(`执行 ${taskName} 失败: ${error}`);
    }
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
