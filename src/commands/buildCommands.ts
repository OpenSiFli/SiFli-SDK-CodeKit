import * as vscode from 'vscode';
import { BuildExecutionService } from '../services/buildExecutionService';
import { ConfigService } from '../services/configService';
import { StatusBarProvider } from '../providers/statusBarProvider';

export class BuildCommands {
  private static instance: BuildCommands;
  private buildExecutionService: BuildExecutionService;
  private configService: ConfigService;
  private statusBarProvider: StatusBarProvider;
  private generateCodebaseIndexPromise?: Promise<boolean>;

  private constructor() {
    this.buildExecutionService = BuildExecutionService.getInstance();
    this.configService = ConfigService.getInstance();
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
        promptBuildIfMissing: true,
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

  public async executeGenerateCodebaseIndexTask(options?: {
    showSuccessNotification?: boolean;
    showFailureNotification?: boolean;
  }): Promise<boolean> {
    if (this.generateCodebaseIndexPromise) {
      return this.generateCodebaseIndexPromise;
    }

    const showSuccessNotification = options?.showSuccessNotification ?? true;
    const showFailureNotification = options?.showFailureNotification ?? true;

    this.generateCodebaseIndexPromise = (async () => {
      try {
        const result = await this.buildExecutionService.executeGenerateCodebaseIndexDetailed({ waitForExit: true });
        if (!result.success) {
          const message =
            result.message ??
            vscode.l10n.t('Failed to generate codebase_index.json (exit code: {0}).', String(result.exitCode ?? '?'));
          if (showFailureNotification) {
            vscode.window.showErrorMessage(message);
          }
          return false;
        }

        if (showSuccessNotification) {
          vscode.window.showInformationMessage(
            vscode.l10n.t(
              'Generated codebase_index.json for board {0}.',
              this.configService.getSelectedBoardName() || vscode.l10n.t('N/A')
            )
          );
        }
        return true;
      } catch (error) {
        console.error('[BuildCommands] Error in executeGenerateCodebaseIndexTask:', error);
        if (showFailureNotification) {
          vscode.window.showErrorMessage(vscode.l10n.t('Failed to generate codebase_index.json: {0}', String(error)));
        }
        return false;
      } finally {
        this.generateCodebaseIndexPromise = undefined;
      }
    })();

    return this.generateCodebaseIndexPromise;
  }
}
