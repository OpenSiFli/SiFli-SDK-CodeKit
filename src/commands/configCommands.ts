import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '../services/configService';
import { BoardService } from '../services/boardService';
import { SerialPortService } from '../services/serialPortService';
import { SerialMonitorService } from '../services/serialMonitorService';
import { SdkService } from '../services/sdkService';
import { ClangdService } from '../services/clangdService';
import { StatusBarProvider } from '../providers/statusBarProvider';
import { HAS_RUN_INITIAL_SETUP_KEY } from '../constants';

export class ConfigCommands {
  private static instance: ConfigCommands;
  private configService: ConfigService;
  private boardService: BoardService;
  private serialPortService: SerialPortService;
  private serialMonitorService: SerialMonitorService;
  private sdkService: SdkService;
  private clangdService: ClangdService;
  private statusBarProvider: StatusBarProvider;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.boardService = BoardService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
    this.serialMonitorService = SerialMonitorService.getInstance();
    this.sdkService = SdkService.getInstance();
    this.clangdService = ClangdService.getInstance();
    this.statusBarProvider = StatusBarProvider.getInstance();
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
          vscode.l10n.t('No SiFli boards found. Check your SDK installation or custom board path settings.')
        );
        return;
      }

      // 允许用户选择芯片模组
      const boardPickOptions = availableBoards.map(board => {
        let description = '';
        if (board.type === 'sdk') {
          description = vscode.l10n.t('Source: SDK default');
        } else if (board.type === 'project_local') {
          description = vscode.l10n.t('Source: project local boards');
        } else if (board.type === 'custom') {
          description = vscode.l10n.t('Source: custom path');
        }

        return {
          label: board.name,
          description,
          detail: board.path,
        };
      });

      const selectedQuickPickItem = await vscode.window.showQuickPick(boardPickOptions, {
        placeHolder: vscode.l10n.t('Select a SiFli board'),
        canPickMany: false,
      });

      if (selectedQuickPickItem) {
        await this.configService.setSelectedBoardName(selectedQuickPickItem.label);
        vscode.window.showInformationMessage(
          vscode.l10n.t('SiFli board switched to: {0}', selectedQuickPickItem.label)
        );
        // 更新状态栏显示
        this.statusBarProvider.updateStatusBarItems();
      }

      // 允许用户修改线程数
      const currentThreads = this.configService.getNumThreads();
      const numThreadsInput = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter build threads (current: J{0})', String(currentThreads)),
        value: String(currentThreads),
        validateInput: value => {
          const parsed = parseInt(value);
          if (isNaN(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
            return vscode.l10n.t('Please enter a positive integer.');
          }
          return null;
        },
      });

      if (numThreadsInput !== undefined && numThreadsInput !== String(currentThreads)) {
        const newThreads = parseInt(numThreadsInput);
        await this.configService.setNumThreads(newThreads);
        vscode.window.showInformationMessage(vscode.l10n.t('Build threads set to: J{0}', String(newThreads)));
        // 更新状态栏显示
        this.statusBarProvider.updateStatusBarItems();
      }
    } catch (error) {
      console.error('[ConfigCommands] Error in selectChipModule:', error);
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to select board: {0}', String(error)));
    }
  }

  /**
   * 选择端口配置（包括串口、下载波特率、监视波特率）
   */
  public async selectPort(): Promise<void> {
    const result = await this.serialPortService.selectPort();
    if (result) {
      // 更新状态栏显示
      this.statusBarProvider.updateStatusBarItems();
    }
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
          const selectBoard = vscode.l10n.t('Select board');
          const selectLater = vscode.l10n.t('Later');
          const response = await vscode.window.showInformationMessage(
            vscode.l10n.t('SiFli project detected. Select the board to start.'),
            selectBoard,
            selectLater
          );

          if (response === selectBoard) {
            await this.selectChipModule();
          }
        } else {
          vscode.window.showWarningMessage(
            vscode.l10n.t('No SiFli boards found. Check your SDK installation or custom board path configuration.')
          );
        }

        // 标记已完成初始设置
        await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, true);
      }
    } catch (error) {
      console.error('[ConfigCommands] Error in promptForInitialBoardSelection:', error);
    }
  }

  /**
   * 列出可用的串口
   */
  public async listSerialPorts(): Promise<void> {
    try {
      const ports = await this.serialMonitorService.listSerialPorts();

      if (ports.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('No serial ports found.'));
        return;
      }

      const items = ports.map(port => ({
        label: port.path,
        description: port.manufacturer || vscode.l10n.t('Unknown manufacturer'),
        detail: port.serialNumber ? vscode.l10n.t('Serial: {0}', port.serialNumber) : vscode.l10n.t('No serial number'),
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: vscode.l10n.t('Available serial ports'),
        title: vscode.l10n.t('Found {0} serial port(s)', String(ports.length)),
      });

      if (selected) {
        vscode.window.showInformationMessage(vscode.l10n.t('Selected serial port: {0}', selected.label));
      }
    } catch (error) {
      console.error('列出串口失败:', error);
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to get serial port list: {0}', String(error)));
    }
  }

  /**
   * 配置 clangd 设置
   */
  public async configureClangd(): Promise<void> {
    try {
      const result = await this.clangdService.configure();
      if (!result.success) {
        const message = result.message ?? vscode.l10n.t('Failed to configure clangd.');
        if (message === vscode.l10n.t('Select a board first.')) {
          vscode.window.showWarningMessage(message);
        } else {
          vscode.window.showErrorMessage(message);
        }
        return;
      }

      // 显示成功消息并提示重启
      const restartAction = vscode.l10n.t('Restart VS Code');
      const laterAction = vscode.l10n.t('Later');
      const action = await vscode.window.showInformationMessage(
        vscode.l10n.t(
          'clangd configuration completed for board {0}. Restart VS Code to apply.',
          result.selectedBoard ?? ''
        ),
        restartAction,
        laterAction
      );

      if (action === restartAction) {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } catch (error) {
      console.error('[ConfigCommands] Error in configureClangd:', error);
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to configure clangd: {0}', String(error)));
    }
  }
}
