import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { BoardService } from '../services/boardService';
import { SerialPortService } from '../services/serialPortService';
import { SdkService } from '../services/sdkService';
import { HAS_RUN_INITIAL_SETUP_KEY } from '../constants';

export class ConfigCommands {
  private static instance: ConfigCommands;
  private configService: ConfigService;
  private boardService: BoardService;
  private serialPortService: SerialPortService;
  private sdkService: SdkService;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.boardService = BoardService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
    this.sdkService = SdkService.getInstance();
  }

  public static getInstance(): ConfigCommands {
    if (!ConfigCommands.instance) {
      ConfigCommands.instance = new ConfigCommands();
    }
    return ConfigCommands.instance;
  }

  /**
   * 选择芯片模组
   */
  public async selectChipModule(): Promise<void> {
    try {
      // 动态获取可用的板子列表
      const availableBoards = await this.boardService.discoverBoards();

      if (availableBoards.length === 0) {
        vscode.window.showWarningMessage(
          '未发现任何 SiFli 芯片模组。请检查您的 SDK 安装或自定义板子路径设置。'
        );
        return;
      }

      // 允许用户选择芯片模组
      const boardPickOptions = availableBoards.map(board => {
        let description = '';
        if (board.type === 'sdk') {
          description = '来源: SDK 默认';
        } else if (board.type === 'project_local') {
          description = '来源: 项目本地 boards 目录';
        } else if (board.type === 'custom') {
          description = '来源: 自定义路径';
        }

        return {
          label: board.name,
          description,
          detail: board.path
        };
      });

      const selectedQuickPickItem = await vscode.window.showQuickPick(boardPickOptions, {
        placeHolder: '选择 SiFli 芯片模组',
        canPickMany: false
      });

      if (selectedQuickPickItem) {
        await this.configService.updateConfigValue(
          'defaultChipModule',
          selectedQuickPickItem.label
        );
        vscode.window.showInformationMessage(
          `SiFli 芯片模组已切换为: ${selectedQuickPickItem.label}`
        );
      }

      // 允许用户修改线程数
      const currentThreads = this.configService.getNumThreads();
      const numThreadsInput = await vscode.window.showInputBox({
        prompt: `输入编译线程数 (当前: J${currentThreads})`,
        value: String(currentThreads),
        validateInput: (value) => {
          const parsed = parseInt(value);
          if (isNaN(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
            return '请输入一个正整数。';
          }
          return null;
        }
      });

      if (numThreadsInput !== undefined && numThreadsInput !== String(currentThreads)) {
        const newThreads = parseInt(numThreadsInput);
        await this.configService.updateConfigValue('numThreads', newThreads);
        vscode.window.showInformationMessage(`编译线程数已设置为: J${newThreads}`);
      }
    } catch (error) {
      console.error('[ConfigCommands] Error in selectChipModule:', error);
      vscode.window.showErrorMessage(`选择芯片模组失败: ${error}`);
    }
  }

  /**
   * 选择下载串口
   */
  public async selectDownloadPort(): Promise<void> {
    await this.serialPortService.selectSerialPort();
  }

  /**
   * 切换 SDK 版本
   */
  public async switchSdkVersion(): Promise<void> {
    await this.sdkService.switchSdkVersion();
  }

  /**
   * 提示用户进行初始板子选择
   */
  public async promptForInitialBoardSelection(context: vscode.ExtensionContext): Promise<void> {
    try {
      const hasRunInitialSetup = context.globalState.get<boolean>(HAS_RUN_INITIAL_SETUP_KEY, false);
      
      if (!hasRunInitialSetup) {
        const availableBoards = await this.boardService.discoverBoards();
        
        if (availableBoards.length > 0) {
          const response = await vscode.window.showInformationMessage(
            '检测到 SiFli 项目！请选择您要使用的芯片模组以开始开发。',
            '选择芯片模组',
            '稍后选择'
          );

          if (response === '选择芯片模组') {
            await this.selectChipModule();
          }
        } else {
          vscode.window.showWarningMessage(
            '未发现任何 SiFli 芯片模组。请检查 SDK 安装或配置自定义板子路径。'
          );
        }

        // 标记已完成初始设置
        await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, true);
      }
    } catch (error) {
      console.error('[ConfigCommands] Error in promptForInitialBoardSelection:', error);
    }
  }
}
