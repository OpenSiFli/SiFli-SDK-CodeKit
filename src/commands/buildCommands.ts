import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TASK_NAMES } from '../constants';
import { ConfigService } from '../services/configService';
import { BoardService } from '../services/boardService';
import { SerialPortService } from '../services/serialPortService';
import { TerminalService } from '../services/terminalService';
import { StatusBarProvider } from '../providers/statusBarProvider';

export class BuildCommands {
  private static instance: BuildCommands;
  private configService: ConfigService;
  private boardService: BoardService;
  private serialPortService: SerialPortService;
  private terminalService: TerminalService;
  private statusBarProvider: StatusBarProvider;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.boardService = BoardService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
    this.terminalService = TerminalService.getInstance();
    this.statusBarProvider = StatusBarProvider.getInstance();
  }

  public static getInstance(): BuildCommands {
    if (!BuildCommands.instance) {
      BuildCommands.instance = new BuildCommands();
    }
    return BuildCommands.instance;
  }

  /**
   * 执行编译任务
   */
  public async executeCompileTask(): Promise<void> {
    try {
      const selectedBoardName = this.configService.getSelectedBoardName();
      if (!selectedBoardName || selectedBoardName === 'N/A') {
        vscode.window.showWarningMessage(
          '请先选择 SiFli 芯片模组。点击状态栏中的板卡名称进行选择。'
        );
        return;
      }

      const numThreads = this.configService.getNumThreads();
      const compileCommand = await this.boardService.getCompileCommand(selectedBoardName, numThreads);
      
      await this.terminalService.executeShellCommandInSiFliTerminal(
        compileCommand, 
        TASK_NAMES.BUILD
      );
    } catch (error) {
      console.error('[BuildCommands] Error in executeCompileTask:', error);
      vscode.window.showErrorMessage(`编译失败: ${error}`);
    }
  }

  /**
   * 执行重新构建任务
   */
  public async executeRebuildTask(): Promise<void> {
    try {
      // 先清理，再编译
      this.executeCleanCommand();
      
      // 等待一段时间确保清理完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await this.executeCompileTask();
    } catch (error) {
      console.error('[BuildCommands] Error in executeRebuildTask:', error);
      vscode.window.showErrorMessage(`重新构建失败: ${error}`);
    }
  }

  /**
   * 执行清理命令
   */
  public executeCleanCommand(): void {
    try {
      const selectedBoardName = this.configService.getSelectedBoardName();
      if (!selectedBoardName || selectedBoardName === 'N/A') {
        vscode.window.showWarningMessage(
          '请先选择 SiFli 芯片模组。点击状态栏中的板卡名称进行选择。'
        );
        return;
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('未打开工作区文件夹。');
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const buildFolder = this.boardService.getBuildTargetFolder(selectedBoardName);
      const buildPath = path.join(workspaceRoot, buildFolder);

      if (!fs.existsSync(buildPath)) {
        vscode.window.showInformationMessage(`构建目录不存在，无需清理: ${buildFolder}`);
        return;
      }

      try {
        fs.rmSync(buildPath, { recursive: true, force: true });
        vscode.window.showInformationMessage(`已清理构建目录: ${buildFolder}`);
        console.log(`[BuildCommands] Cleaned build directory: ${buildPath}`);
      } catch (error) {
        console.error(`[BuildCommands] Error cleaning build directory:`, error);
        vscode.window.showErrorMessage(`清理构建目录失败: ${error}`);
      }
    } catch (error) {
      console.error('[BuildCommands] Error in executeCleanCommand:', error);
      vscode.window.showErrorMessage(`清理失败: ${error}`);
    }
  }

  /**
   * 执行下载任务
   */
  public async executeDownloadTask(): Promise<void> {
    try {
      const selectedBoardName = this.configService.getSelectedBoardName();
      if (!selectedBoardName || selectedBoardName === 'N/A') {
        vscode.window.showWarningMessage(
          '请先选择 SiFli 芯片模组。点击状态栏中的板卡名称进行选择。'
        );
        return;
      }

      const selectedSerialPort = this.serialPortService.selectedSerialPort;
      if (!selectedSerialPort) {
        vscode.window.showWarningMessage(
          '请先选择串口。点击状态栏中的 "COM: N/A" 进行选择。'
        );
        return;
      }

      // 验证构建目录是否存在
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('未打开工作区文件夹。');
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const buildFolder = this.boardService.getBuildTargetFolder(selectedBoardName);
      const buildPath = path.join(workspaceRoot, buildFolder);

      if (!fs.existsSync(buildPath)) {
        const response = await vscode.window.showWarningMessage(
          `构建目录不存在: ${buildFolder}。是否先执行构建？`,
          '执行构建',
          '取消'
        );
        
        if (response === '执行构建') {
          await this.executeCompileTask();
          // 等待构建完成后再继续下载
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          return;
        }
      }

      // 在下载操作前处理串口监视器
      await this.statusBarProvider.handlePreDownloadOperation();

      const downloadCommand = await this.boardService.getSftoolDownloadCommand(
        selectedBoardName, 
        selectedSerialPort,
        this.serialPortService.downloadBaudRate
      );
      
      const exitCode = await this.terminalService.executeShellCommandInSiFliTerminal(
        downloadCommand, 
        TASK_NAMES.DOWNLOAD,
        { waitForExit: true }
      );

      if (exitCode !== undefined && exitCode !== 0) {
        throw new Error(`下载命令执行失败，退出码: ${exitCode}`);
      }

      await this.statusBarProvider.handlePostDownloadOperation();
    
    } catch (error) {
      console.error('[BuildCommands] Error in executeDownloadTask:', error);
      vscode.window.showErrorMessage(`下载失败: ${error instanceof Error ? error.message : error}`);
      
      // 即使发生错误也尝试恢复串口监视器
      await this.statusBarProvider.handlePostDownloadOperation();
    }
  }

  /**
   * 执行 Menuconfig 任务
   */
  public async executeMenuconfigTask(): Promise<void> {
    try {
      const selectedBoardName = this.configService.getSelectedBoardName();
      if (!selectedBoardName || selectedBoardName === 'N/A') {
        vscode.window.showWarningMessage(
          '请先选择 SiFli 芯片模组。点击状态栏中的板卡名称进行选择。'
        );
        return;
      }

      const menuconfigCommand = await this.boardService.getMenuconfigCommand(selectedBoardName);
      
      await this.terminalService.executeShellCommandInSiFliTerminal(
        menuconfigCommand, 
        TASK_NAMES.MENUCONFIG
      );
    } catch (error) {
      console.error('[BuildCommands] Error in executeMenuconfigTask:', error);
      vscode.window.showErrorMessage(`打开 Menuconfig 失败: ${error}`);
    }
  }
}
