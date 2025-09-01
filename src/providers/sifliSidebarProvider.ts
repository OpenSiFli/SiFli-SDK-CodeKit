import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { SdkService } from '../services/sdkService';
import { VueWebviewProvider } from './vueWebviewProvider';
import { SerialPortService } from '../services/serialPortService';

export class SifliSidebarItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri },
    public readonly tooltip?: string,
    public readonly contextValue?: string,
    public readonly description?: string
  ) {
    super(label, collapsibleState);
    this.command = command;
    this.iconPath = iconPath;
    this.tooltip = tooltip;
    this.contextValue = contextValue;
    this.description = description;
  }
}

export class SifliSidebarProvider implements vscode.TreeDataProvider<SifliSidebarItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SifliSidebarItem | undefined | null | void> = new vscode.EventEmitter<SifliSidebarItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SifliSidebarItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private configService: ConfigService;
  private sdkService: SdkService;
  private serialPortService: SerialPortService;

  constructor() {
    this.configService = ConfigService.getInstance();
    this.sdkService = SdkService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SifliSidebarItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SifliSidebarItem): Thenable<SifliSidebarItem[]> {
    if (!element) {
      // 根级项目
      return this.getRootItems();
    } else if (element.contextValue === 'configGroup') {
      // 配置组的子项
      return this.getConfigItems();
    }

    return Promise.resolve([]);
  }

  private async getRootItems(): Promise<SifliSidebarItem[]> {
    const items: SifliSidebarItem[] = [];

    // SDK 管理
    items.push(new SifliSidebarItem(
      'SDK 管理',
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'extension.manageSiFliSdk',
        title: 'SDK 管理',
        arguments: []
      },
      new vscode.ThemeIcon('cloud-download'),
      '打开 SiFli SDK 管理器 - 安装、切换和管理 SDK 版本',
      'sdkManager'
    ));

    // 当前配置状态分组
    items.push(new SifliSidebarItem(
      '项目配置',
      vscode.TreeItemCollapsibleState.Expanded,
      undefined,
      new vscode.ThemeIcon('settings-gear'),
      '查看和修改当前项目配置',
      'configGroup'
    ));

    return items;
  }

  private async getConfigItems(): Promise<SifliSidebarItem[]> {
    const items: SifliSidebarItem[] = [];

    // SDK 版本
    const currentSdk = this.configService.getCurrentSdk();
    const sdkDescription = currentSdk ? currentSdk.version : '未配置';
    
    items.push(new SifliSidebarItem(
      'SDK 版本',
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'extension.switchSdkVersion',
        title: '切换 SDK 版本',
        arguments: []
      },
      new vscode.ThemeIcon('package'),
      '点击切换 SiFli SDK 版本',
      'sdkVersion',
      sdkDescription
    ));

    // 芯片模组
    const selectedBoard = this.configService.getSelectedBoardName();
    const numThreads = this.configService.getNumThreads();
    const boardDescription = selectedBoard ? `${selectedBoard} (J${numThreads})` : '未选择';
    
    items.push(new SifliSidebarItem(
      '芯片模组',
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'extension.selectChipModule',
        title: '切换芯片模组',
        arguments: []
      },
      new vscode.ThemeIcon('circuit-board'),
      '点击切换 SiFli 芯片模组和线程数',
      'chipModule',
      boardDescription
    ));

    // 串口配置
    const selectedPort = this.serialPortService.selectedSerialPort;
    const portDescription = selectedPort ? SerialPortService.getDisplayPortName(selectedPort) : '未选择';
    
    items.push(new SifliSidebarItem(
      '串口配置',
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'extension.selectPort',
        title: '选择串口',
        arguments: []
      },
      new vscode.ThemeIcon('plug'),
      '点击配置串口连接',
      'serialPort',
      portDescription
    ));

    return items;
  }
}

export class SifliSidebarManager {
  private static instance: SifliSidebarManager;
  private sidebarProvider: SifliSidebarProvider;
  private treeView: vscode.TreeView<SifliSidebarItem>;

  private constructor() {
    this.sidebarProvider = new SifliSidebarProvider();
    this.treeView = vscode.window.createTreeView('sifliSdkManager', {
      treeDataProvider: this.sidebarProvider,
      showCollapseAll: false
    });
  }

  public static getInstance(): SifliSidebarManager {
    if (!SifliSidebarManager.instance) {
      SifliSidebarManager.instance = new SifliSidebarManager();
    }
    return SifliSidebarManager.instance;
  }

  public refresh(): void {
    this.sidebarProvider.refresh();
  }

  public register(context: vscode.ExtensionContext): void {
    // 注册刷新命令
    const refreshCommand = vscode.commands.registerCommand('sifliSidebar.refresh', () => {
      this.refresh();
    });

    context.subscriptions.push(this.treeView, refreshCommand);

    // 监听配置变化
    const configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('sifli-sdk-codekit')) {
        this.refresh();
      }
    });

    context.subscriptions.push(configChangeListener);
  }

  public dispose(): void {
    this.treeView.dispose();
  }
}
