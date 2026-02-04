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
          vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.')
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
      vscode.window.showErrorMessage(vscode.l10n.t('Build failed: {0}', String(error)));
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
      vscode.window.showErrorMessage(vscode.l10n.t('Rebuild failed: {0}', String(error)));
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
          vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.')
        );
        return;
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(vscode.l10n.t('No workspace folder is open.'));
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const buildFolder = this.boardService.getBuildTargetFolder(selectedBoardName);
      const buildPath = path.join(workspaceRoot, buildFolder);

      if (!fs.existsSync(buildPath)) {
        vscode.window.showInformationMessage(
          vscode.l10n.t('Build directory does not exist. No cleanup needed: {0}', buildFolder)
        );
        return;
      }

      try {
        fs.rmSync(buildPath, { recursive: true, force: true });
        vscode.window.showInformationMessage(
          vscode.l10n.t('Build directory cleaned: {0}', buildFolder)
        );
        console.log(`[BuildCommands] Cleaned build directory: ${buildPath}`);
      } catch (error) {
        console.error(`[BuildCommands] Error cleaning build directory:`, error);
        vscode.window.showErrorMessage(
          vscode.l10n.t('Failed to clean build directory: {0}', String(error))
        );
      }
    } catch (error) {
      console.error('[BuildCommands] Error in executeCleanCommand:', error);
      vscode.window.showErrorMessage(vscode.l10n.t('Clean failed: {0}', String(error)));
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
          vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.')
        );
        return;
      }

      const selectedSerialPort = this.serialPortService.selectedSerialPort;
      if (!selectedSerialPort) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('Select a serial port first. Click "COM: N/A" in the status bar.')
        );
        return;
      }

      // 验证构建目录是否存在
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(vscode.l10n.t('No workspace folder is open.'));
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const buildFolder = this.boardService.getBuildTargetFolder(selectedBoardName);
      const buildPath = path.join(workspaceRoot, buildFolder);

      if (!fs.existsSync(buildPath)) {
        const buildAction = vscode.l10n.t('Build');
        const cancelAction = vscode.l10n.t('Cancel');
        const response = await vscode.window.showWarningMessage(
          vscode.l10n.t('Build directory does not exist: {0}. Build first?', buildFolder),
          buildAction,
          cancelAction
        );
        
        if (response === buildAction) {
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
        throw new Error(vscode.l10n.t('Download command failed with exit code: {0}', String(exitCode)));
      }

      await this.statusBarProvider.handlePostDownloadOperation();
    
    } catch (error) {
      console.error('[BuildCommands] Error in executeDownloadTask:', error);
      vscode.window.showErrorMessage(
        vscode.l10n.t('Download failed: {0}', error instanceof Error ? error.message : String(error))
      );
      
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
          vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.')
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
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to open Menuconfig: {0}', String(error)));
    }
  }
}
