import * as vscode from 'vscode';
import { BuildExecutionService } from '../services/buildExecutionService';
import { StatusBarProvider } from '../providers/statusBarProvider';

export class BuildCommands {
  private static instance: BuildCommands;
  private buildExecutionService: BuildExecutionService;
  private statusBarProvider: StatusBarProvider;

  private constructor() {
    this.buildExecutionService = BuildExecutionService.getInstance();
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
      await this.buildExecutionService.executeCompile({ waitForExit: false });
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
      const cleanOk = this.buildExecutionService.executeClean();
      if (!cleanOk) {
        return;
      }
      await this.buildExecutionService.executeCompile({ waitForExit: false });
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
      this.buildExecutionService.executeClean();
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
      const monitorClosed = await this.statusBarProvider.handlePreDownloadOperation();
      if (!monitorClosed) {
        return;
      }

      const downloadOk = await this.buildExecutionService.executeDownload({
        waitForExit: true,
        ensureBuildDirectory: true,
        promptBuildIfMissing: true
      });
      if (!downloadOk) {
        return;
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
      await this.buildExecutionService.executeMenuconfig({ waitForExit: false });
    } catch (error) {
      console.error('[BuildCommands] Error in executeMenuconfigTask:', error);
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to open Menuconfig: {0}', String(error)));
    }
  }
}
