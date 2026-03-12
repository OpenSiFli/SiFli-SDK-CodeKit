import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { SdkService } from '../services/sdkService';
import { VueWebviewProvider } from './vueWebviewProvider';
import { SerialPortService } from '../services/serialPortService';
import { WorkflowService } from '../services/workflowService';
import { McpServerService } from '../services/mcpServerService';
import { StatusBarProvider } from './statusBarProvider';
import { isSiFliProject } from '../utils/projectUtils';
import { getWorkflowStepDisplayLabel, getWorkflowStepTypeLabel } from '../utils/workflowStepLabel';

export class SifliSidebarItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri },
    public readonly tooltip?: string,
    public readonly contextValue?: string,
    public readonly description?: string,
    public readonly metadata?: Record<string, string>
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
  private _onDidChangeTreeData: vscode.EventEmitter<SifliSidebarItem | undefined | null | void> =
    new vscode.EventEmitter<SifliSidebarItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SifliSidebarItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private configService: ConfigService;
  private sdkService: SdkService;
  private serialPortService: SerialPortService;
  private workflowService: WorkflowService;
  private mcpServerService: McpServerService;
  private statusBarProvider: StatusBarProvider;

  constructor() {
    this.configService = ConfigService.getInstance();
    this.sdkService = SdkService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
    this.workflowService = WorkflowService.getInstance();
    this.mcpServerService = McpServerService.getInstance();
    this.statusBarProvider = StatusBarProvider.getInstance();
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
    } else if (element.contextValue === 'workflowGroup') {
      return this.getWorkflowItems();
    } else if (element.contextValue === 'workflowWorkspaceGroup') {
      return this.getWorkflowItemsByScope('workspace');
    } else if (element.contextValue === 'workflowUserGroup') {
      return this.getWorkflowItemsByScope('user');
    } else if (element.contextValue === 'workflowItem') {
      return this.getWorkflowStepItems(element);
    } else if (element.contextValue === 'statusBarGroup') {
      return this.getStatusBarButtonItems();
    } else if (element.contextValue === 'statusBarDefaultGroup') {
      return this.getDefaultStatusBarButtonItems();
    } else if (element.contextValue === 'statusBarWorkspaceGroup') {
      return this.getStatusBarButtonItemsByScope('workspace');
    } else if (element.contextValue === 'statusBarUserGroup') {
      return this.getStatusBarButtonItemsByScope('user');
    } else if (element.contextValue === 'mcpGroup') {
      return this.getMcpItems();
    }

    return Promise.resolve([]);
  }

  private async getRootItems(): Promise<SifliSidebarItem[]> {
    const items: SifliSidebarItem[] = [];

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Create New Project'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.createNewSiFliProject',
          title: vscode.l10n.t('Create New Project'),
          arguments: [],
        },
        new vscode.ThemeIcon('new-folder'),
        vscode.l10n.t('Create a new SiFli project from an SDK example'),
        'createProject'
      )
    );

    // SDK 管理
    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('MCP Server'),
        vscode.TreeItemCollapsibleState.Expanded,
        undefined,
        new vscode.ThemeIcon('plug'),
        vscode.l10n.t('View and configure the embedded MCP server'),
        'mcpGroup'
      )
    );

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('SDK Manager'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.manageSiFliSdk',
          title: vscode.l10n.t('SDK Manager'),
          arguments: [],
        },
        new vscode.ThemeIcon('cloud-download'),
        vscode.l10n.t('Open SiFli SDK Manager to install, switch, and manage SDK versions'),
        'sdkManager'
      )
    );

    // 只有在 SiFli 项目中才显示项目配置
    if (isSiFliProject()) {
      items.push(
        new SifliSidebarItem(
          vscode.l10n.t('Project Configuration'),
          vscode.TreeItemCollapsibleState.Expanded,
          undefined,
          new vscode.ThemeIcon('settings-gear'),
          vscode.l10n.t('View and modify the current project configuration'),
          'configGroup'
        )
      );

      items.push(
        new SifliSidebarItem(
          vscode.l10n.t('Workflows'),
          vscode.TreeItemCollapsibleState.Expanded,
          undefined,
          new vscode.ThemeIcon('run-all'),
          vscode.l10n.t('View and manage workflows and status bar workflow bindings'),
          'workflowGroup'
        )
      );

      items.push(
        new SifliSidebarItem(
          vscode.l10n.t('Status Bar Buttons'),
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          new vscode.ThemeIcon('layout-statusbar'),
          vscode.l10n.t('View status bar button bindings'),
          'statusBarGroup'
        )
      );
    }

    return items;
  }

  private async getConfigItems(): Promise<SifliSidebarItem[]> {
    const items: SifliSidebarItem[] = [];

    // SDK 版本
    const currentSdk = this.configService.getCurrentSdk();
    const sdkDescription = currentSdk ? currentSdk.version : vscode.l10n.t('Not configured');

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('SDK Version'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.switchSdkVersion',
          title: vscode.l10n.t('Switch SDK Version'),
          arguments: [],
        },
        new vscode.ThemeIcon('package'),
        vscode.l10n.t('Click to switch SiFli SDK version'),
        'sdkVersion',
        sdkDescription
      )
    );

    // 芯片模组
    const selectedBoard = this.configService.getSelectedBoardName();
    const numThreads = this.configService.getNumThreads();
    const boardDescription = selectedBoard ? `${selectedBoard} (J${numThreads})` : vscode.l10n.t('Not selected');

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Board'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.selectChipModule',
          title: vscode.l10n.t('Switch Board'),
          arguments: [],
        },
        new vscode.ThemeIcon('circuit-board'),
        vscode.l10n.t('Click to switch SiFli board and build threads'),
        'chipModule',
        boardDescription
      )
    );

    // 串口配置
    const selectedPort = this.serialPortService.selectedSerialPort;
    const portDescription = selectedPort
      ? SerialPortService.getDisplayPortName(selectedPort)
      : vscode.l10n.t('Not selected');

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Serial Port'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.selectPort',
          title: vscode.l10n.t('Select Serial Port'),
          arguments: [],
        },
        new vscode.ThemeIcon('plug'),
        vscode.l10n.t('Click to configure serial connection'),
        'serialPort',
        portDescription
      )
    );

    // 新建 SiFli 终端
    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('New SiFli Terminal'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.createNewSiFliTerminal',
          title: vscode.l10n.t('New SiFli Terminal'),
          arguments: [],
        },
        new vscode.ThemeIcon('terminal'),
        vscode.l10n.t('Create a new terminal with SiFli environment'),
        'newSifliTerminal'
      )
    );

    // 配置 clangd
    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Configure clangd'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.configureClangd',
          title: vscode.l10n.t('Configure clangd'),
          arguments: [],
        },
        new vscode.ThemeIcon('tools'),
        vscode.l10n.t('Configure clangd compile-commands-dir path'),
        'clangdConfig'
      )
    );

    return items;
  }

  private async getMcpItems(): Promise<SifliSidebarItem[]> {
    const items: SifliSidebarItem[] = [];
    const settings = this.mcpServerService.getSettings();
    const connection = this.mcpServerService.getConnectionInfo();
    const statusLabel = !settings.enabled
      ? vscode.l10n.t('Disabled')
      : connection.running
        ? vscode.l10n.t('Running')
        : vscode.l10n.t('Stopped');
    const statusCommand = settings.enabled
      ? connection.running
        ? 'extension.mcp.stop'
        : 'extension.mcp.start'
      : 'extension.mcp.toggleEnabled';
    const statusTooltip = !settings.enabled
      ? vscode.l10n.t('Click to enable MCP')
      : connection.running
        ? vscode.l10n.t('Click to stop the embedded MCP server')
        : vscode.l10n.t('Click to start the embedded MCP server');

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Status'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: statusCommand,
          title: vscode.l10n.t('Toggle MCP status'),
          arguments: [],
        },
        new vscode.ThemeIcon(!settings.enabled ? 'circle-slash' : connection.running ? 'play-circle' : 'debug-stop'),
        statusTooltip,
        'mcpStatusItem',
        statusLabel
      )
    );

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Auto Start'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.mcp.toggleAutoStart',
          title: vscode.l10n.t('Toggle MCP auto-start'),
          arguments: [],
        },
        new vscode.ThemeIcon(settings.autoStart ? 'history' : 'debug-pause'),
        vscode.l10n.t('Click to toggle automatic MCP server startup'),
        'mcpToggleItem',
        settings.autoStart ? vscode.l10n.t('On') : vscode.l10n.t('Off')
      )
    );

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Configure Endpoint'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.mcp.configureEndpoint',
          title: vscode.l10n.t('Configure MCP endpoint'),
          arguments: [],
        },
        new vscode.ThemeIcon('settings-gear'),
        vscode.l10n.t('Edit MCP host, port and optional fixed token'),
        'mcpSettingItem',
        `${settings.host}:${settings.port || 0}`
      )
    );

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Copy Connection Info'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.mcp.showConnectionInfo',
          title: vscode.l10n.t('Copy MCP connection info'),
          arguments: [],
        },
        new vscode.ThemeIcon('copy'),
        vscode.l10n.t('Copy JSON configuration for external MCP clients'),
        'mcpConnectionItem',
        connection.running ? vscode.l10n.t('JSON') : vscode.l10n.t('Starts server')
      )
    );

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Open Logs'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.mcp.showLogs',
          title: vscode.l10n.t('Open logs'),
          arguments: [],
        },
        new vscode.ThemeIcon('output'),
        vscode.l10n.t('Open the SiFli CodeKit log output'),
        'mcpActionItem'
      )
    );

    return items;
  }

  private async getWorkflowItems(): Promise<SifliSidebarItem[]> {
    const items: SifliSidebarItem[] = [];

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Add Workflow'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.workflows.create',
          title: vscode.l10n.t('Create workflow'),
          arguments: [],
        },
        new vscode.ThemeIcon('add'),
        vscode.l10n.t('Create a new workflow'),
        'workflowCreateEntry'
      )
    );

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Workspace Workflows'),
        vscode.TreeItemCollapsibleState.Expanded,
        undefined,
        new vscode.ThemeIcon('folder-library'),
        vscode.l10n.t('Workflows saved in workspace settings'),
        'workflowWorkspaceGroup'
      )
    );

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('User Workflows'),
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        new vscode.ThemeIcon('account'),
        vscode.l10n.t('Workflows saved in user settings'),
        'workflowUserGroup'
      )
    );

    return items;
  }

  private async getWorkflowItemsByScope(scope: 'workspace' | 'user'): Promise<SifliSidebarItem[]> {
    const items: SifliSidebarItem[] = [];
    const workflows =
      scope === 'workspace' ? this.workflowService.getWorkspaceWorkflows() : this.workflowService.getUserWorkflows();

    workflows.forEach(workflow => {
      const stepCount = Array.isArray(workflow.steps) ? workflow.steps.length : 0;
      items.push(
        new SifliSidebarItem(
          workflow.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          new vscode.ThemeIcon('run-all'),
          workflow.description || workflow.id,
          'workflowItem',
          `${stepCount} step(s)`,
          { workflowId: workflow.id, workflowScope: scope }
        )
      );
    });

    return items;
  }

  private async getStatusBarButtonItems(): Promise<SifliSidebarItem[]> {
    const items: SifliSidebarItem[] = [];
    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Default Status Buttons'),
        vscode.TreeItemCollapsibleState.Expanded,
        undefined,
        new vscode.ThemeIcon('home'),
        vscode.l10n.t('Default status bar buttons provided by the extension'),
        'statusBarDefaultGroup'
      )
    );

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('Workspace Status Buttons'),
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        new vscode.ThemeIcon('folder-library'),
        vscode.l10n.t('Status bar buttons saved in workspace settings'),
        'statusBarWorkspaceGroup'
      )
    );

    items.push(
      new SifliSidebarItem(
        vscode.l10n.t('User Status Buttons'),
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        new vscode.ThemeIcon('account'),
        vscode.l10n.t('Status bar buttons saved in user settings'),
        'statusBarUserGroup'
      )
    );

    return items;
  }

  private async getDefaultStatusBarButtonItems(): Promise<SifliSidebarItem[]> {
    const items: SifliSidebarItem[] = [];
    const defaultButtons = this.statusBarProvider.getDefaultWorkflowButtons();
    const workspaceOverrides = new Set(this.workflowService.getWorkspaceStatusBarButtons().map(button => button.id));

    defaultButtons.forEach(button => {
      const actionDescription =
        button.action.kind === 'workflow'
          ? `workflow: ${button.action.workflowId || 'N/A'}`
          : `command: ${button.action.commandId || 'N/A'}`;
      const parsed = this.parseStatusButtonText(button.text);
      const label = this.isIconOnlyStatusButtonText(button.text)
        ? this.getDefaultStatusButtonLabel(button.id)
        : parsed.label;
      const description = workspaceOverrides.has(button.id)
        ? vscode.l10n.t('Overridden in workspace settings')
        : actionDescription;
      items.push(
        new SifliSidebarItem(
          label,
          vscode.TreeItemCollapsibleState.None,
          undefined,
          new vscode.ThemeIcon(parsed.icon || 'rocket'),
          button.tooltip || button.id,
          'defaultWorkflowButtonItem',
          description,
          { buttonId: button.id, buttonScope: 'default' }
        )
      );
    });

    return items;
  }

  private async getStatusBarButtonItemsByScope(scope: 'workspace' | 'user'): Promise<SifliSidebarItem[]> {
    const items: SifliSidebarItem[] = [];
    const sourceButtons =
      scope === 'workspace'
        ? this.workflowService.getWorkspaceStatusBarButtons()
        : this.workflowService.getUserStatusBarButtons();
    const defaultButtonIds = new Set(this.statusBarProvider.getDefaultWorkflowButtons().map(button => button.id));
    const buttons = sourceButtons.filter(button => !defaultButtonIds.has(button.id));
    const workflowNameById = new Map(
      this.workflowService.getResolvedWorkflows().map(workflow => [workflow.id, workflow.name])
    );

    buttons.forEach(button => {
      const actionDescription =
        button.action.kind === 'workflow'
          ? `workflow: ${workflowNameById.get(button.action.workflowId || '') || 'N/A'}`
          : `command: ${button.action.commandId || 'N/A'}`;
      const parsed = this.parseStatusButtonText(button.text);

      items.push(
        new SifliSidebarItem(
          parsed.label,
          vscode.TreeItemCollapsibleState.None,
          undefined,
          new vscode.ThemeIcon(parsed.icon || 'rocket'),
          button.tooltip || button.id,
          'workflowButtonItem',
          actionDescription,
          { buttonId: button.id, buttonScope: scope }
        )
      );
    });

    return items;
  }

  private parseStatusButtonText(text: string): { icon?: string; label: string } {
    const raw = text || '';
    const match = raw.match(/^\s*\$\(([^)]+)\)\s*(.*)$/);
    if (!match) {
      return { label: raw };
    }

    const iconName = (match[1] || '').trim();
    const label = (match[2] || '').trim();
    const isValidIconName = /^[a-zA-Z][a-zA-Z0-9-]*$/.test(iconName);
    return {
      icon: isValidIconName ? iconName : undefined,
      label: label || raw,
    };
  }

  private isIconOnlyStatusButtonText(text: string): boolean {
    return /^\s*\$\([^)]+\)\s*$/.test(text || '');
  }

  private getDefaultStatusButtonLabel(buttonId: string): string {
    switch (buttonId) {
      case 'compile':
        return vscode.l10n.t('Build (Compile)');
      case 'rebuild':
        return vscode.l10n.t('Rebuild');
      case 'clean':
        return vscode.l10n.t('Clean');
      case 'download':
        return vscode.l10n.t('Download');
      case 'menuconfig':
        return vscode.l10n.t('Menuconfig');
      case 'deviceMonitor':
        return vscode.l10n.t('Open Serial Monitor');
      default:
        return buttonId;
    }
  }

  private async getWorkflowStepItems(workflowItem: SifliSidebarItem): Promise<SifliSidebarItem[]> {
    const workflowId = workflowItem.metadata?.workflowId;
    const workflowScope = workflowItem.metadata?.workflowScope as 'workspace' | 'user' | undefined;
    if (!workflowId) {
      return [];
    }

    const workflows =
      workflowScope === 'user'
        ? this.workflowService.getUserWorkflows()
        : workflowScope === 'workspace'
          ? this.workflowService.getWorkspaceWorkflows()
          : this.workflowService.getResolvedWorkflows();

    const workflow = workflows.find(item => item.id === workflowId);
    if (!workflow) {
      return [];
    }
    const workflowMetadata: Record<string, string> = { workflowId };
    if (workflowScope) {
      workflowMetadata.workflowScope = workflowScope;
    }

    const items: SifliSidebarItem[] = [
      new SifliSidebarItem(
        vscode.l10n.t('Add step'),
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'extension.workflows.stepAdd',
          title: vscode.l10n.t('Add step'),
          arguments: [{ metadata: workflowMetadata }],
        },
        new vscode.ThemeIcon('add'),
        vscode.l10n.t('Add step to workflow'),
        'workflowStepAddItem',
        undefined,
        workflowMetadata
      ),
    ];

    const workflowSteps = Array.isArray(workflow.steps) ? workflow.steps : [];
    workflowSteps.forEach((step, index) => {
      const stepLabel = getWorkflowStepDisplayLabel(step);
      const stepTooltip =
        step.type === 'shell.command' && typeof step.args?.command === 'string'
          ? `${getWorkflowStepTypeLabel(step.type)}: ${step.args.command}`
          : vscode.l10n.t(
              'wait: {0}, continueOnError: {1}',
              String(step.wait ?? false),
              String(step.continueOnError ?? false)
            );
      items.push(
        new SifliSidebarItem(
          `${index + 1}. ${stepLabel}`,
          vscode.TreeItemCollapsibleState.None,
          undefined,
          new vscode.ThemeIcon('symbol-method'),
          stepTooltip,
          'workflowStepItem',
          undefined,
          { ...workflowMetadata, stepIndex: String(index) }
        )
      );
    });

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
      showCollapseAll: false,
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
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('sifli-sdk-codekit')) {
        this.refresh();
      }
    });

    context.subscriptions.push(configChangeListener);

    const mcpStateListener = McpServerService.getInstance().onDidChangeState(() => {
      this.refresh();
    });

    context.subscriptions.push(mcpStateListener);
  }

  public dispose(): void {
    this.treeView.dispose();
  }
}
