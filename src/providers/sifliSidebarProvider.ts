import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { SdkService } from '../services/sdkService';
import { VueWebviewProvider } from './vueWebviewProvider';
import { SerialPortService } from '../services/serialPortService';
import { isSiFliProject } from '../utils/projectUtils';

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

    items.push(new SifliSidebarItem(
      vscode.l10n.t('Create New Project'),
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'extension.createNewSiFliProject',
        title: vscode.l10n.t('Create New Project'),
        arguments: []
      },
      new vscode.ThemeIcon('new-folder'),
      vscode.l10n.t('Create a new SiFli project from an SDK example'),
      'createProject'
    ));

    // SDK 管理
    items.push(new SifliSidebarItem(
      vscode.l10n.t('SDK Manager'),
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'extension.manageSiFliSdk',
        title: vscode.l10n.t('SDK Manager'),
        arguments: []
      },
      new vscode.ThemeIcon('cloud-download'),
      vscode.l10n.t('Open SiFli SDK Manager to install, switch, and manage SDK versions'),
      'sdkManager'
    ));

    // 只有在 SiFli 项目中才显示项目配置
    if (isSiFliProject()) {
      items.push(new SifliSidebarItem(
        vscode.l10n.t('Project Configuration'),
        vscode.TreeItemCollapsibleState.Expanded,
        undefined,
        new vscode.ThemeIcon('settings-gear'),
        vscode.l10n.t('View and modify the current project configuration'),
        'configGroup'
      ));
    }

    return items;
  }

  private async getConfigItems(): Promise<SifliSidebarItem[]> {
    const items: SifliSidebarItem[] = [];

    // SDK 版本
    const currentSdk = this.configService.getCurrentSdk();
    const sdkDescription = currentSdk ? currentSdk.version : vscode.l10n.t('Not configured');
    
    items.push(new SifliSidebarItem(
      vscode.l10n.t('SDK Version'),
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'extension.switchSdkVersion',
        title: vscode.l10n.t('Switch SDK Version'),
        arguments: []
      },
      new vscode.ThemeIcon('package'),
      vscode.l10n.t('Click to switch SiFli SDK version'),
      'sdkVersion',
      sdkDescription
    ));

    // 芯片模组
    const selectedBoard = this.configService.getSelectedBoardName();
    const numThreads = this.configService.getNumThreads();
    const boardDescription = selectedBoard
      ? `${selectedBoard} (J${numThreads})`
      : vscode.l10n.t('Not selected');
    
    items.push(new SifliSidebarItem(
      vscode.l10n.t('Board'),
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'extension.selectChipModule',
        title: vscode.l10n.t('Switch Board'),
        arguments: []
      },
      new vscode.ThemeIcon('circuit-board'),
      vscode.l10n.t('Click to switch SiFli board and build threads'),
      'chipModule',
      boardDescription
    ));

    // 串口配置
    const selectedPort = this.serialPortService.selectedSerialPort;
    const portDescription = selectedPort
      ? SerialPortService.getDisplayPortName(selectedPort)
      : vscode.l10n.t('Not selected');
    
    items.push(new SifliSidebarItem(
      vscode.l10n.t('Serial Port'),
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'extension.selectPort',
        title: vscode.l10n.t('Select Serial Port'),
        arguments: []
      },
      new vscode.ThemeIcon('plug'),
      vscode.l10n.t('Click to configure serial connection'),
      'serialPort',
      portDescription
    ));

    // 新建 SiFli 终端
    items.push(new SifliSidebarItem(
      vscode.l10n.t('New SiFli Terminal'),
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'extension.createNewSiFliTerminal',
        title: vscode.l10n.t('New SiFli Terminal'),
        arguments: []
      },
      new vscode.ThemeIcon('terminal'),
      vscode.l10n.t('Create a new terminal with SiFli environment'),
      'newSifliTerminal'
    ));

    // 配置 clangd
    items.push(new SifliSidebarItem(
      vscode.l10n.t('Configure clangd'),
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'extension.configureClangd',
        title: vscode.l10n.t('Configure clangd'),
        arguments: []
      },
      new vscode.ThemeIcon('tools'),
      vscode.l10n.t('Configure clangd compile-commands-dir path'),
      'clangdConfig'
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
