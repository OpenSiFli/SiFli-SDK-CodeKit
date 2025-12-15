import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '../services/configService';
import { BoardService } from '../services/boardService';
import { SerialPortService } from '../services/serialPortService';
import { SerialMonitorService } from '../services/serialMonitorService';
import { SdkService } from '../services/sdkService';
import { StatusBarProvider } from '../providers/statusBarProvider';
import { HAS_RUN_INITIAL_SETUP_KEY } from '../constants';

export class ConfigCommands {
  private static instance: ConfigCommands;
  private configService: ConfigService;
  private boardService: BoardService;
  private serialPortService: SerialPortService;
  private serialMonitorService: SerialMonitorService;
  private sdkService: SdkService;
  private statusBarProvider: StatusBarProvider;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.boardService = BoardService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
    this.serialMonitorService = SerialMonitorService.getInstance();
    this.sdkService = SdkService.getInstance();
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
        await this.configService.setSelectedBoardName(selectedQuickPickItem.label);
        vscode.window.showInformationMessage(
          `SiFli 芯片模组已切换为: ${selectedQuickPickItem.label}`
        );
        // 更新状态栏显示
        this.statusBarProvider.updateStatusBarItems();
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
        await this.configService.setNumThreads(newThreads);
        vscode.window.showInformationMessage(`编译线程数已设置为: J${newThreads}`);
        // 更新状态栏显示
        this.statusBarProvider.updateStatusBarItems();
      }
    } catch (error) {
      console.error('[ConfigCommands] Error in selectChipModule:', error);
      vscode.window.showErrorMessage(`选择芯片模组失败: ${error}`);
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

  /**
   * 列出可用的串口
   */
  public async listSerialPorts(): Promise<void> {
    try {
      const ports = await this.serialMonitorService.listSerialPorts();
      
      if (ports.length === 0) {
        vscode.window.showInformationMessage('没有找到可用的串口设备');
        return;
      }

      const items = ports.map(port => ({
        label: port.path,
        description: port.manufacturer || '未知制造商',
        detail: port.serialNumber ? `序列号: ${port.serialNumber}` : '无序列号信息'
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '可用的串口设备',
        title: `发现 ${ports.length} 个串口设备`
      });

      if (selected) {
        vscode.window.showInformationMessage(`已选择串口: ${selected.label}`);
      }
    } catch (error) {
      console.error('列出串口失败:', error);
      vscode.window.showErrorMessage(`获取串口列表失败: ${error}`);
    }
  }

  /**
   * 配置 clangd 设置
   */
  public async configureClangd(): Promise<void> {
    try {
      // 获取当前选择的芯片模组
      const selectedBoard = this.configService.getSelectedBoardName();
      
      if (!selectedBoard || selectedBoard === 'N/A') {
        vscode.window.showWarningMessage('请先选择芯片模组');
        return;
      }

      // 获取工作区文件夹
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('未找到工作区文件夹');
        return;
      }

      // 构建 .vscode/settings.json 路径
      const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
      const settingsPath = path.join(vscodeDir, 'settings.json');

      // 确保 .vscode 目录存在
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      }

      // 读取现有的 settings.json
      let settings: any = {};
      if (fs.existsSync(settingsPath)) {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        try {
          settings = JSON.parse(content);
        } catch (error) {
          console.error('[ConfigCommands] Error parsing settings.json:', error);
          settings = {};
        }
      }

      // 构建 compile-commands-dir 路径
      const compileCommandsDir = `\${workspaceFolder}/project/build_${selectedBoard}_hcpu`;

      // 更新 clangd.arguments
      settings['clangd.arguments'] = [`--compile-commands-dir=${compileCommandsDir}`];

      // 写入 settings.json
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), 'utf-8');

      console.log(`[ConfigCommands] clangd 配置已更新: ${settingsPath}`);
      
      // 显示成功消息并提示重启
      const action = await vscode.window.showInformationMessage(
        `clangd 配置已完成，已设置为芯片模组 ${selectedBoard}。建议重启 VS Code 以使配置生效。`,
        '重启 VS Code',
        '稍后重启'
      );

      if (action === '重启 VS Code') {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } catch (error) {
      console.error('[ConfigCommands] Error in configureClangd:', error);
      vscode.window.showErrorMessage(`配置 clangd 失败: ${error}`);
    }
  }
}
