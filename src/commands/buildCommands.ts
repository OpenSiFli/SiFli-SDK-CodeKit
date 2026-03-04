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

  public async buildWithSaveCheck() {
    // 获取配置：检查构建前保存的方式
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    const buildWithSaveCheck = config.get<string>('buildWithSaveCheck') ?? 'prompt';

    // 如果配置为不需要检查保存，直接执行编译
    if (buildWithSaveCheck === 'doNotSave') {
      await this.executeCompileTask();
      return;
    }

    // 检查是否有未保存的文件（包括所有文本文档，不只是可见编辑器）
    const hasDirtyDocs = vscode.workspace.textDocuments.some(doc => doc.isDirty);

    if (hasDirtyDocs) {
      let action: string | undefined = buildWithSaveCheck;

      // 如果当前配置是"prompt"，则弹窗询问用户
      if (buildWithSaveCheck === 'prompt') {
        const saveAllAction = vscode.l10n.t('Save All');
        const saveCurrentAction = vscode.l10n.t('Save Current File');
        const doNotSaveAction = vscode.l10n.t("Don't Save");
        const askEveryTimeAction = vscode.l10n.t('Ask Every Time');

        const response = await vscode.window.showWarningMessage(
          vscode.l10n.t('Save Dialog Alert'),
          { modal: true },
          saveAllAction,
          saveCurrentAction,
          doNotSaveAction,
          askEveryTimeAction
        );

        if (response === undefined) {
          // 用户选择取消或关闭了对话框
          return; // 不执行编译
        }

        // 根据用户选择决定下一步操作
        if (response === saveAllAction) {
          action = 'saveAll';
          // 更新配置为始终保存所有文件
          await config.update('buildWithSaveCheck', 'saveAll', vscode.ConfigurationTarget.Global);
        } else if (response === saveCurrentAction) {
          action = 'saveCurrent';
          // 更新配置为始终保存当前文件
          await config.update('buildWithSaveCheck', 'saveCurrent', vscode.ConfigurationTarget.Global);
        } else if (response === doNotSaveAction) {
          action = 'doNotSave';
          // 更新配置为不保存
          await config.update('buildWithSaveCheck', 'doNotSave', vscode.ConfigurationTarget.Global);
        } else if (response === askEveryTimeAction) {
          // 用户选择每次都询问，所以不需要做任何更改，继续保持 prompt
          return;
        }
      }

      // 根据确定的操作执行相应的保存动作
      if (action === 'saveAll') {
        const saved = await vscode.workspace.saveAll(false);

        if (!saved) {
          // 如果有文件保存失败（例如用户取消了"另存为"对话框）
          const proceed = await vscode.window.showWarningMessage(
            vscode.l10n.t('Some files could not be saved. Continue building anyway?'),
            vscode.l10n.t('Continue'),
            vscode.l10n.t('Cancel')
          );

          if (proceed !== vscode.l10n.t('Continue')) {
            return; // 取消编译
          }
        }
      } else if (action === 'saveCurrent') {
        // 保存当前文件
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.isDirty) {
          const saved = await activeEditor.document.save();
          if (!saved) {
            // 如果有文件保存失败（例如用户取消了"另存为"对话框）
            const proceed = await vscode.window.showWarningMessage(
              vscode.l10n.t('Current file could not be saved. Continue building anyway?'),
              vscode.l10n.t('Continue'),
              vscode.l10n.t('Cancel')
            );

            if (proceed !== vscode.l10n.t('Continue')) {
              return; // 取消编译
            }
          }
        }
      } else if (action === 'doNotSave') {
        // 不保存，直接继续编译
      }
    }

    console.log('[BuildCommands] buildWithSaveCheck called');
    // 执行编译操作
    await this.executeCompileTask();
  }

  /**
   * 执行编译任务
   */
  public async executeCompileTask(): Promise<void> {
    try {
      await this.buildExecutionService.executeCompile({ waitForExit: false });
    } catch (error) {
      console.error('[BuildCommands] Error in buildWithSaveCheck:', error);
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

  /**
   * 切换构建前保存检查的设置，循环切换不同选项
   */
  public async toggleBuildWithSaveCheck(): Promise<void> {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    const currentValue = config.get<string>('buildWithSaveCheck') ?? 'prompt';

    // 定义循环顺序：prompt -> saveAll -> saveCurrent -> doNotSave -> prompt
    let newValue: string;
    switch (currentValue) {
      case 'prompt':
        newValue = 'saveAll';
        break;
      case 'saveAll':
        newValue = 'saveCurrent';
        break;
      case 'saveCurrent':
        newValue = 'doNotSave';
        break;
      case 'doNotSave':
        newValue = 'prompt';
        break;
      default:
        newValue = 'prompt'; // 默认回到 prompt
        break;
    }

    await config.update('buildWithSaveCheck', newValue, vscode.ConfigurationTarget.Global);

    let message: string;
    switch (newValue) {
      case 'prompt':
        message = vscode.l10n.t(
          'Build with save check is now set to "Prompt". You will be asked what to do before building when there are unsaved changes.'
        );
        break;
      case 'saveAll':
        message = vscode.l10n.t(
          'Build with save check is now set to "Always Save All". Changed files will be saved before building.'
        );
        break;
      case 'saveCurrent':
        message = vscode.l10n.t(
          'Build with save check is now set to "Always Save Current". The current file will be saved before building.'
        );
        break;
      case 'doNotSave':
        message = vscode.l10n.t(
          'Build with save check is now set to "Don\'t Save". Files will not be saved before building.'
        );
        break;
      default:
        message = vscode.l10n.t('Build with save check setting updated.');
        break;
    }

    vscode.window.showInformationMessage(message);
  }
}
