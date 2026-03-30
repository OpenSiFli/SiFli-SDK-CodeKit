import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CMD_PREFIX, HAS_RUN_INITIAL_SETUP_KEY, LAST_VERSION_KEY, SIFLI_PROJECT_CONTEXT_KEY } from './constants';
import { ConfigService } from './services/configService';
import { SdkService } from './services/sdkService';
import { GitService } from './services/gitService';
import { SerialPortService } from './services/serialPortService';
import { TerminalService } from './services/terminalService';
import { PythonService } from './services/pythonService';
import { MinGitService } from './services/minGitService';
import { LogService } from './services/logService';
import { RegionService } from './services/regionService';
import { WorkspaceStateService } from './services/workspaceStateService';
import { BuildCommands } from './commands/buildCommands';
import { ConfigCommands } from './commands/configCommands';
import { ProjectCommands } from './commands/projectCommands';
import { SdkCommands } from './commands/sdkCommands';
import { WorkflowCommands } from './commands/workflowCommands';
import { McpCommands } from './commands/mcpCommands';
import { StatusBarProvider } from './providers/statusBarProvider';
import { VueWebviewProvider } from './providers/vueWebviewProvider';
import { SifliSidebarManager } from './providers/sifliSidebarProvider';
import { SdkDependencyExplorerManager } from './providers/sdkDependencyExplorerProvider';
import { WorkflowService } from './services/workflowService';
import { LanguageModelToolService } from './services/languageModelToolService';
import { McpServerService } from './services/mcpServerService';
import { McpServerDefinitionProviderService } from './services/mcpServerDefinitionProviderService';
import { isSiFliProject } from './utils/projectUtils';
import { registerProbeRsDebugger } from './probe-rs/extension';
import { disposePeripheralViewer, initPeripheralViewer } from './peripheral-viewer';

/**
 * 扩展激活函数
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 初始化日志服务
  const logService = LogService.getInstance();

  logService.info('SiFli SDK CodeKit extension is activating...');

  // Register SiFli probe-rs debugger contributions
  registerProbeRsDebugger(context);

  // Initialize the built-in Peripheral Viewer before project-specific gating.
  context.subscriptions.push(await initPeripheralViewer(context));

  // 初始化 WorkspaceStateService（必须在其他服务之前初始化）
  const workspaceStateService = WorkspaceStateService.getInstance();
  workspaceStateService.initialize(context);
  logService.info('WorkspaceStateService initialized');

  // *** 仅在开发调试时使用：强制重置首次运行标志 ***
  // 这将使得每次"重新运行调试"时,Quick Pick 都会弹出。
  // 在发布生产版本时,请务必删除或注释掉此行！
  // await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, false);
  // ******************************************************

  // 初始化服务
  const configService = ConfigService.getInstance();

  // 执行配置迁移（根据版本号决定是否需要迁移）
  await configService.runConfigMigrations(context);

  const sdkService = SdkService.getInstance();
  const gitService = GitService.getInstance();
  const serialPortService = SerialPortService.getInstance();
  const terminalService = TerminalService.getInstance();
  const pythonService = PythonService.getInstance();
  const minGitService = MinGitService.getInstance();
  const regionService = RegionService.getInstance();
  pythonService.setContext(context);
  minGitService.setContext(context);
  regionService.prewarm(); // 异步预热区域检测结果

  // 初始化命令处理器
  const buildCommands = BuildCommands.getInstance();
  const configCommands = ConfigCommands.getInstance();
  const projectCommands = ProjectCommands.getInstance();
  const sdkCommands = SdkCommands.getInstance();
  const workflowCommands = WorkflowCommands.getInstance();
  const mcpCommands = McpCommands.getInstance();

  // 初始化状态栏提供者
  const statusBarProvider = StatusBarProvider.getInstance();

  // 初始化 Vue WebView 提供者
  const vueWebviewProvider = VueWebviewProvider.getInstance();

  // 初始化侧边栏管理器
  const sidebarManager = SifliSidebarManager.getInstance();
  const sdkDependencyExplorerManager = SdkDependencyExplorerManager.getInstance();
  const workflowService = WorkflowService.getInstance();
  const languageModelToolService = LanguageModelToolService.getInstance();
  const mcpServerService = McpServerService.getInstance();
  const mcpServerDefinitionProviderService = McpServerDefinitionProviderService.getInstance();

  // 注册输出通道和 Git 输出通道到订阅列表
  context.subscriptions.push(logService.getOutputChannel(), gitService.getOutputChannel());

  // 在插件激活时立即读取配置
  await configService.updateConfiguration();
  logService.info('Configuration loaded successfully');

  const refreshProjectContext = async (): Promise<void> => {
    await vscode.commands.executeCommand('setContext', SIFLI_PROJECT_CONTEXT_KEY, isSiFliProject());
  };
  await refreshProjectContext();
  languageModelToolService.register(context);
  mcpServerDefinitionProviderService.register(context);
  try {
    await mcpServerService.syncWithConfiguration();
  } catch (error) {
    logService.error('Failed to sync MCP configuration during activation:', error);
  }
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void refreshProjectContext();
    })
  );

  // 检查并安装嵌入式 Python (仅限 Windows)
  // 不阻塞激活过程，在后台运行
  pythonService.checkAndInstallPython().catch(err => {
    logService.error('Error checking/installing embedded Python:', err);
  });

  // 检查并安装 MinGit (仅限 Windows，无阻塞)
  minGitService.ensureGitAvailable().catch(err => {
    logService.error('Error ensuring MinGit:', err);
  });

  // 如版本更新，提示查看 Release Notes
  await showReleaseNotesIfUpdated(context);

  // 初始化串口服务（恢复之前保存的串口选择）
  await serialPortService.initialize();

  // 发现 SDK 版本
  const sdkVersions = await sdkService.discoverSiFliSdks();
  configService.detectedSdkVersions = sdkVersions;
  logService.info(`Discovered ${sdkVersions.length} SDK versions`);

  // 注册 SDK 管理命令（无论是否为 SiFli 项目都需要注册）
  // 这样用户可以在任何情况下通过侧边栏管理 SDK
  const manageSdkCommand = vscode.commands.registerCommand(CMD_PREFIX + 'manageSiFliSdk', () =>
    vueWebviewProvider.createSdkManagementWebview(context)
  );
  const createProjectCommand = vscode.commands.registerCommand(CMD_PREFIX + 'createNewSiFliProject', () =>
    projectCommands.createNewSiFliProject()
  );
  const startMcpCommand = vscode.commands.registerCommand(CMD_PREFIX + 'mcp.start', async () => {
    await mcpCommands.startServer();
  });
  const stopMcpCommand = vscode.commands.registerCommand(CMD_PREFIX + 'mcp.stop', async () => {
    await mcpCommands.stopServer();
  });
  const showMcpCommand = vscode.commands.registerCommand(CMD_PREFIX + 'mcp.showConnectionInfo', async () => {
    await mcpCommands.copyConnectionInfo();
  });
  const toggleMcpEnabledCommand = vscode.commands.registerCommand(CMD_PREFIX + 'mcp.toggleEnabled', async () => {
    await mcpCommands.toggleEnabled();
  });
  const toggleMcpAutoStartCommand = vscode.commands.registerCommand(CMD_PREFIX + 'mcp.toggleAutoStart', async () => {
    await mcpCommands.toggleAutoStart();
  });
  const configureMcpEndpointCommand = vscode.commands.registerCommand(
    CMD_PREFIX + 'mcp.configureEndpoint',
    async () => {
      await mcpCommands.configureEndpoint();
    }
  );
  const showMcpLogsCommand = vscode.commands.registerCommand(CMD_PREFIX + 'mcp.showLogs', async () => {
    await mcpCommands.showLogs();
  });
  const refreshSdkDependenciesCommand = vscode.commands.registerCommand(CMD_PREFIX + 'refreshSdkDependencies', () => {
    sdkDependencyExplorerManager.refresh();
  });
  const generateCodebaseIndexCommand = vscode.commands.registerCommand(
    CMD_PREFIX + 'generateCodebaseIndex',
    async () => {
      const succeeded = await buildCommands.executeGenerateCodebaseIndexTask();
      if (succeeded) {
        sdkDependencyExplorerManager.refresh();
      }
    }
  );
  context.subscriptions.push(
    manageSdkCommand,
    createProjectCommand,
    refreshSdkDependenciesCommand,
    generateCodebaseIndexCommand,
    startMcpCommand,
    stopMcpCommand,
    showMcpCommand,
    toggleMcpEnabledCommand,
    toggleMcpAutoStartCommand,
    configureMcpEndpointCommand,
    showMcpLogsCommand
  );
  logService.info('SDK management command registered');

  sdkDependencyExplorerManager.register(context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async e => {
      if (e.affectsConfiguration('sifli-sdk-codekit.mcp')) {
        try {
          await mcpServerService.syncWithConfiguration();
        } catch (error) {
          logService.error('Failed to sync MCP configuration after settings change:', error);
        }
        mcpServerDefinitionProviderService.notifyDefinitionsChanged();
      }
      if (e.affectsConfiguration('sifli-sdk-codekit.workflows')) {
        mcpServerService.notifyToolsListChanged();
        mcpServerDefinitionProviderService.notifyDefinitionsChanged();
      }
    })
  );

  // 检查是否为 SiFli 项目
  if (isSiFliProject()) {
    logService.info('SiFli project detected. Activating full extension features.');

    // 如果有当前 SDK，在插件激活时自动激活它
    const currentSdk = configService.getCurrentSdk();
    if (currentSdk && currentSdk.valid) {
      try {
        logService.info(`Auto-activating current SDK: ${currentSdk.version} at ${currentSdk.path}`);
        await sdkService.activateSdk(currentSdk);
      } catch (error) {
        logService.error('Error activating current SDK on startup:', error);
      }
    } else {
      // 如果没有当前 SDK ，并且只发现了一个 SDK，则自动激活它
      const discoveredSdks = await sdkService.discoverSiFliSdks();
      const validSdks = discoveredSdks.filter(sdk => sdk.valid);
      if (validSdks.length === 1) {
        try {
          logService.info(
            `Only one SDK discovered (${validSdks[0].version} at ${validSdks[0].path}), auto-activating it.`
          );
          await sdkService.activateSdk(validSdks[0]);
        } catch (err) {
          logService.error('Error activating the only discovered SDK:', err);
        }
      }
    }
    console.log('[SiFli Extension] SiFli project detected. Activating full extension features.');

    // 初始化状态栏
    statusBarProvider.initializeStatusBarItems(context);

    // 注册侧边栏
    sidebarManager.register(context);

    // 延迟执行初始设置
    setTimeout(async () => {
      await configCommands.promptForInitialBoardSelection(context);
      await configService.updateConfiguration(); // 再次调用以确保在 promptForInitialBoardSelection 之后更新 SDK 列表和状态栏
      statusBarProvider.updateStatusBarItems(); // 更新状态栏显示

      // 获取或创建终端
      await terminalService.getOrCreateSiFliTerminalAndCdProject();
    }, 500);

    // 监听配置变化
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('sifli-sdk-codekit')) {
          logService.info('Configuration changed, updating...');
          await configService.updateConfiguration();
          const newSdkVersions = await sdkService.discoverSiFliSdks();
          configService.detectedSdkVersions = newSdkVersions;
          statusBarProvider.updateStatusBarItems();
          workflowService.reportValidationIssues(false);
          mcpServerService.notifyToolsListChanged();
          if (e.affectsConfiguration('sifli-sdk-codekit.workflows')) {
            mcpServerDefinitionProviderService.notifyDefinitionsChanged();
          }
          await refreshProjectContext();
          logService.info('Configuration update completed');
        }
      })
    );

    // 注册命令（仅限 SiFli 项目）
    const commands = [
      vscode.commands.registerCommand(CMD_PREFIX + 'compile', () => buildCommands.buildWithSaveCheck(true)),
      vscode.commands.registerCommand(CMD_PREFIX + 'rebuild', () => buildCommands.buildWithSaveCheck(false)),
      vscode.commands.registerCommand(CMD_PREFIX + 'clean', () => buildCommands.executeCleanCommand()),
      vscode.commands.registerCommand(CMD_PREFIX + 'download', () => buildCommands.executeDownloadTask()),
      vscode.commands.registerCommand(CMD_PREFIX + 'menuconfig', () => buildCommands.executeMenuconfigTask()),
      vscode.commands.registerCommand(CMD_PREFIX + 'selectChipModule', () => configCommands.selectChipModule()),
      vscode.commands.registerCommand(CMD_PREFIX + 'selectPort', () => configCommands.selectPort()),
      // 注意：manageSiFliSdk 已在外部注册，无论是否为 SiFli 项目
      vscode.commands.registerCommand(CMD_PREFIX + 'switchSdkVersion', () => configCommands.switchSdkVersion()),
      vscode.commands.registerCommand(CMD_PREFIX + 'openDeviceMonitor', () => statusBarProvider.openDeviceMonitor()),
      vscode.commands.registerCommand(CMD_PREFIX + 'closeDeviceMonitor', () => statusBarProvider.closeDeviceMonitor()),
      vscode.commands.registerCommand(CMD_PREFIX + 'createNewSiFliTerminal', async () => {
        const terminal = await terminalService.getOrCreateSiFliTerminalAndCdProject(true);
        terminal.show();
      }),
      vscode.commands.registerCommand(CMD_PREFIX + 'listSerialPorts', () => configCommands.listSerialPorts()),
      vscode.commands.registerCommand(CMD_PREFIX + 'configureClangd', () => configCommands.configureClangd()),
      vscode.commands.registerCommand(CMD_PREFIX + 'showLogs', () => {
        logService.info('Logs displayed by user request');
      }),
      vscode.commands.registerCommand(CMD_PREFIX + 'workflows.manage', () => workflowCommands.openManager()),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'workflows.run',
        (item?: string | { metadata?: Record<string, string> }) => {
          const workflowId = typeof item === 'string' ? item : item?.metadata?.workflowId;
          return workflowCommands.runWorkflow(workflowId);
        }
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'workflows.runDry',
        (item?: string | { metadata?: Record<string, string> }) => {
          const workflowId = typeof item === 'string' ? item : item?.metadata?.workflowId;
          return workflowCommands.runWorkflow(workflowId, true);
        }
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'workflows.create', () => workflowCommands.createWorkflow()),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'workflows.edit',
        (item?: { metadata?: Record<string, string> } | string) =>
          workflowCommands.editWorkflow(typeof item === 'string' ? item : item?.metadata?.workflowId)
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'workflows.copy',
        (item?: { metadata?: Record<string, string> } | string) => workflowCommands.copyWorkflow(item)
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'workflows.delete',
        (item?: { metadata?: Record<string, string> } | string) => workflowCommands.deleteWorkflow(item)
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'workflows.pin',
        (item?: { metadata?: Record<string, string> } | string) =>
          workflowCommands.pinWorkflowToStatusBar(typeof item === 'string' ? item : item?.metadata?.workflowId)
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'workflows.rename',
        (item?: string | { metadata?: Record<string, string> }) => workflowCommands.renameWorkflow(item)
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'workflows.stepAdd',
        (item?: string | { metadata?: Record<string, string> }) => workflowCommands.addStep(item)
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'workflows.stepDelete',
        (item?: { metadata?: Record<string, string> }) => workflowCommands.deleteStep(item)
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'workflows.stepMoveUp',
        (item?: { metadata?: Record<string, string> }) => workflowCommands.moveStepUp(item)
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'workflows.stepMoveDown',
        (item?: { metadata?: Record<string, string> }) => workflowCommands.moveStepDown(item)
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'workflows.showDiagnostics', () =>
        workflowService.showValidationDiagnostics()
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'statusBarButtons.delete',
        (item?: string | { metadata?: Record<string, string> }) => workflowCommands.deleteStatusBarButton(item)
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'statusBarButtons.copy',
        (item?: string | { metadata?: Record<string, string> }) => workflowCommands.copyStatusBarButton(item)
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'statusBarButtons.rename',
        (item?: string | { metadata?: Record<string, string> }) => workflowCommands.renameStatusBarButton(item)
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'statusBarButtons.overrideDefault',
        (item?: string | { metadata?: Record<string, string> }) => workflowCommands.overrideDefaultStatusBarButton(item)
      ),
      vscode.commands.registerCommand(
        CMD_PREFIX + 'runStatusBarButton',
        (item?: string | { metadata?: Record<string, string> }) => {
          const buttonId = typeof item === 'string' ? item : item?.metadata?.buttonId;
          if (!buttonId) {
            return;
          }
          return statusBarProvider.executeStatusBarButton(buttonId);
        }
      ),
      vscode.commands.registerCommand(`${CMD_PREFIX}toggleBuildWithSaveCheck`, async () => {
        const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
        const buildWithSaveCheck = config.get<string>('buildWithSaveCheck') ?? 'prompt';
        const savePrompt = vscode.l10n.t('Ask Every Time');
        const saveAllAction = vscode.l10n.t('Save All');
        const doNotSaveAction = vscode.l10n.t("Don't Save");
        const saveCurrentAction = vscode.l10n.t('Save Current File');
        const optionMappings = [
          { value: 'prompt', label: savePrompt },
          { value: 'saveAll', label: saveAllAction },
          { value: 'saveCurrent', label: saveCurrentAction },
          { value: 'dontSave', label: doNotSaveAction },
        ];
        const options: vscode.QuickPickItem[] = optionMappings.map(item => {
          if (item.value === buildWithSaveCheck) {
            return {
              label: item.label,
              description: vscode.l10n.t('(current)'), // 可选：在描述栏显示当前值
              picked: item.value === buildWithSaveCheck, // 核心：默认选中当前值对应的项
            };
          } else {
            return {
              label: item.label,
            };
          }
        });
        // 此处需要可设置偏好 buildWithSaveCheck
        const firstResponse = await vscode.window.showQuickPick(options, {
          placeHolder: vscode.l10n.t('command.toggleBuildWithSaveCheck.title'),
          ignoreFocusOut: true,
        });
        if (firstResponse) {
          const selectedValue = optionMappings.find(m => m.label === firstResponse.label);
          if (selectedValue) {
            const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
            config.update('buildWithSaveCheck', selectedValue.value, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(
              vscode.l10n.t('Build with save check has been set to {0}', selectedValue.label)
            );
          }
        }
      }),
    ];

    context.subscriptions.push(...commands);

    workflowService.reportValidationIssues(false);

    logService.info('SiFli SDK CodeKit extension activated successfully');
  } else {
    logService.info('Not a SiFli project. Extension features will not be activated.');
    // 即使不是 SiFli 项目，也注册侧边栏，允许用户管理 SDK
    sidebarManager.register(context);
  }
}

/**
 * 扩展停用函数
 */
export async function deactivate(): Promise<void> {
  const logService = LogService.getInstance();
  logService.info('SiFli SDK CodeKit extension is deactivating...');

  disposePeripheralViewer();

  // 清理状态栏
  const statusBarProvider = StatusBarProvider.getInstance();
  statusBarProvider.dispose();

  // 清理侧边栏
  const sidebarManager = SifliSidebarManager.getInstance();
  sidebarManager.dispose();

  const sdkDependencyExplorerManager = SdkDependencyExplorerManager.getInstance();
  sdkDependencyExplorerManager.dispose();

  // 清理终端
  const terminalService = TerminalService.getInstance();
  terminalService.disposeSiFliTerminals();

  // 清理 Git 服务
  const gitService = GitService.getInstance();
  gitService.dispose();

  // 清理 MCP 服务
  const mcpServerService = McpServerService.getInstance();
  await mcpServerService.stop();

  // 清理日志服务
  logService.info('SiFli SDK CodeKit extension deactivated');
  logService.dispose();
}

async function showReleaseNotesIfUpdated(context: vscode.ExtensionContext): Promise<void> {
  const currentVersion = vscode.extensions.getExtension('SiFli.sifli-sdk-codekit')?.packageJSON.version as
    | string
    | undefined;
  if (!currentVersion) {
    return;
  }

  const previousVersion = context.globalState.get<string>(LAST_VERSION_KEY);

  // 始次安装或版本未变更
  if (!previousVersion) {
    await context.globalState.update(LAST_VERSION_KEY, currentVersion);
    return;
  }
  if (previousVersion === currentVersion) {
    return;
  }

  const releaseNotesPath = path.join(context.extensionPath, 'RELEASE_NOTES.md');
  const openReleaseNotes = async () => {
    try {
      if (fs.existsSync(releaseNotesPath)) {
        const uri = vscode.Uri.file(releaseNotesPath);
        // 优先使用 Markdown 预览呈现更友好的界面
        await vscode.commands.executeCommand('markdown.showPreview', uri);
      } else {
        vscode.window.showWarningMessage(vscode.l10n.t('Offline Release Notes file not found.'));
      }
    } catch (err) {
      const logService = LogService.getInstance();
      logService.error('Failed to open Release Notes:', err);
    }
  };

  const viewNotes = vscode.l10n.t('View release notes');
  const viewLater = vscode.l10n.t('Later');
  const choice = await vscode.window.showInformationMessage(
    vscode.l10n.t('SiFli SDK CodeKit updated to {0}. View release notes?', currentVersion),
    viewNotes,
    viewLater
  );

  if (choice === viewNotes) {
    await openReleaseNotes();
  }

  await context.globalState.update(LAST_VERSION_KEY, currentVersion);
}
