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
  public async buildWithSaveCheck(onlyCompile: boolean) {
    // 获取配置：检查构建前保存的方式
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    const buildWithSaveCheck = config.get<string>('buildWithSaveCheck') ?? 'prompt';

    // 如果配置为不需要检查保存，直接执行编译
    if (buildWithSaveCheck === 'doNotSave') {
      await this.executeCompileTask();
      return;
    }

    // 检查是否有未保存的文件（包括所有文本文档，不只是可见编辑器）
    const unsavedDocs = vscode.workspace.textDocuments.filter(doc => doc.isDirty);

    if (unsavedDocs.length > 0) {
      let action: string | undefined = buildWithSaveCheck;

      // 如果当前配置是"prompt"，则执行二次提示逻辑
      if (buildWithSaveCheck === 'prompt') {
        // ===== 第一次弹窗：选择具体操作（阻塞，必须选择） =====
        const saveAllAction = vscode.l10n.t('Save All');
        const saveCurrentAction = vscode.l10n.t('Save Current File');
        const doNotSaveAction = vscode.l10n.t("Don't Save");

        const firstResponse = await vscode.window.showWarningMessage(
          vscode.l10n.t('Save Dialog Alert'),
          { modal: true },
          saveAllAction,
          saveCurrentAction,
          doNotSaveAction
        );

        // 用户关闭第一次弹窗，直接返回（不执行编译）
        if (firstResponse === undefined) {
          return;
        }

        // 映射用户选择到对应的操作标识
        let selectedAction: string;
        switch (firstResponse) {
          case saveAllAction:
            selectedAction = 'saveAll';
            break;
          case saveCurrentAction:
            selectedAction = 'saveCurrent';
            break;
          case doNotSaveAction:
            selectedAction = 'doNotSave';
            break;
          default:
            selectedAction = 'prompt'; // 兜底
        }
        action = selectedAction;

        // ===== 第二次弹窗：非阻塞式询问是否记住选择 =====
        // 移除await，直接调用，不等待用户回答，主流程继续执行
        const rememberAction = vscode.l10n.t('Remember my choice'); // 记住选择
        // const notRememberAction = vscode.l10n.t('Not remember'); // 不记住
        const askEveryTimeAction = vscode.l10n.t('Ask Every Time'); // 每次询问

        // 非阻塞调用：弹窗展示，但主流程不等待
        vscode.window
          .showInformationMessage(
            vscode.l10n.t('Do you want to remember this choice for future builds?'),
            { modal: false }, // 非模态，不阻塞界面操作
            rememberAction,
            // notRememberAction,
            askEveryTimeAction
          )
          .then(secondResponse => {
            // 异步处理用户的选择（不影响主流程）
            try {
              if (secondResponse === rememberAction) {
                // 用户选择“记住”，异步更新全局配置
                config.update('buildWithSaveCheck', selectedAction, vscode.ConfigurationTarget.Global);
              } else if (secondResponse === askEveryTimeAction) {
                // 强制重置配置为prompt
                config.update('buildWithSaveCheck', 'prompt', vscode.ConfigurationTarget.Global);
              }
              // 选“不记住”/关闭弹窗：不更新配置
            } catch (error) {
              console.warn('[BuildCommands] Failed to update save choice config:', error);
            }
          });
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
        let targetDoc: vscode.TextDocument | undefined;
        // 一个文件未保存
        if (unsavedDocs.length === 1) {
          targetDoc = unsavedDocs[0];
          await vscode.window.showTextDocument(targetDoc, { preserveFocus: false });
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
        } else {
          // 多个文件未保存
          // 2. 构建多选选项列表
          const options: vscode.QuickPickItem[] = unsavedDocs.map(doc => ({
            label: vscode.workspace.asRelativePath(doc.fileName),
            description: vscode.l10n.t('Unsaved changes'),
            detail: doc.fileName,
          }));

          // 3. 开启多选的快速选择
          const selected = await vscode.window.showQuickPick(options, {
            placeHolder: vscode.l10n.t(
              'Select unsaved file(s) to save before building (hold Ctrl/Cmd to multi-select)'
            ),
            ignoreFocusOut: true,
            canPickMany: true, // 核心：开启多选
          });
          if (selected && selected?.length > 0) {
            // 5. 批量保存选中的文件
            const failedFiles: string[] = [];
            for (const item of selected) {
              const targetDoc = unsavedDocs.find(doc => vscode.workspace.asRelativePath(doc.fileName) === item.label);

              if (targetDoc) {
                let saved = false;
                try {
                  saved = await targetDoc.save();
                } catch (error) {
                  vscode.window.showErrorMessage(
                    vscode.l10n.t('Error saving {0}: {1}', item.label, (error as Error).message)
                  );
                }
                if (!saved) {
                  failedFiles.push(item.label);
                }
              }
            }
          } else {
            vscode.window.showWarningMessage(vscode.l10n.t('No files to save, ignored action'));
            return;
          }
        }
      } else if (action === 'doNotSave') {
        // 不保存，直接继续编译
      }
    }

    console.log('[BuildCommands] buildWithSaveCheck called');
    if (onlyCompile) {
      // 执行编译操作（不会被第二次弹窗阻塞）
      await this.executeCompileTask();
    } else {
      await this.executeRebuildTask();
    }
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
