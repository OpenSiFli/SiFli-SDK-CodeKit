import * as vscode from 'vscode';
import { CMD_PREFIX, HAS_RUN_INITIAL_SETUP_KEY } from './constants';
import { ConfigService } from './services/configService';
import { SdkService } from './services/sdkService';
import { GitService } from './services/gitService';
import { SerialPortService } from './services/serialPortService';
import { TerminalService } from './services/terminalService';
import { PythonService } from './services/pythonService';
import { MinGitService } from './services/minGitService';
import { LogService } from './services/logService';
import { RegionService } from './services/regionService';
import { BuildCommands } from './commands/buildCommands';
import { ConfigCommands } from './commands/configCommands';
import { SdkCommands } from './commands/sdkCommands';
import { StatusBarProvider } from './providers/statusBarProvider';
import { VueWebviewProvider } from './providers/vueWebviewProvider';
import { SifliSidebarManager } from './providers/sifliSidebarProvider';
import { isSiFliProject } from './utils/projectUtils';
import { registerProbeRsDebugger } from './probe-rs/extension';

/**
 * 扩展激活函数
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 初始化日志服务
  const logService = LogService.getInstance();
  
  logService.info('SiFli SDK CodeKit extension is activating...');

  // Register SiFli probe-rs debugger contributions
  registerProbeRsDebugger(context);

  // *** 仅在开发调试时使用：强制重置首次运行标志 ***
  // 这将使得每次"重新运行调试"时,Quick Pick 都会弹出。
  // 在发布生产版本时,请务必删除或注释掉此行！
  // await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, false);
  // ******************************************************

  // 初始化服务
  const configService = ConfigService.getInstance();
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
  const sdkCommands = SdkCommands.getInstance();
  
  // 初始化状态栏提供者
  const statusBarProvider = StatusBarProvider.getInstance();
  
  // 初始化 Vue WebView 提供者
  const vueWebviewProvider = VueWebviewProvider.getInstance();

  // 初始化侧边栏管理器
  const sidebarManager = SifliSidebarManager.getInstance();

  // 注册输出通道和 Git 输出通道到订阅列表
  context.subscriptions.push(
    logService.getOutputChannel(),
    gitService.getOutputChannel()
  );

  // 在插件激活时立即读取配置
  await configService.updateConfiguration();
  logService.info('Configuration loaded successfully');
  
  // 检查并安装嵌入式 Python (仅限 Windows)
  // 不阻塞激活过程，在后台运行
  pythonService.checkAndInstallPython().catch(err => {
    logService.error('Error checking/installing embedded Python:', err);
  });

  // 检查并安装 MinGit (仅限 Windows，无阻塞)
  minGitService.ensureGitAvailable().catch(err => {
    logService.error('Error ensuring MinGit:', err);
  });

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
  context.subscriptions.push(manageSdkCommand);
  logService.info('SDK management command registered');

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
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('sifli-sdk-codekit')) {
          logService.info('Configuration changed, updating...');
          await configService.updateConfiguration();
          const newSdkVersions = await sdkService.discoverSiFliSdks();
          configService.detectedSdkVersions = newSdkVersions;
          statusBarProvider.updateStatusBarItems();
          logService.info('Configuration update completed');
        }
      })
    );

    // 注册命令（仅限 SiFli 项目）
    const commands = [
      vscode.commands.registerCommand(CMD_PREFIX + 'compile', () => 
        buildCommands.executeCompileTask()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'rebuild', () => 
        buildCommands.executeRebuildTask()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'clean', () => 
        buildCommands.executeCleanCommand()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'download', () => 
        buildCommands.executeDownloadTask()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'menuconfig', () => 
        buildCommands.executeMenuconfigTask()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'selectChipModule', () => 
        configCommands.selectChipModule()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'selectPort', () => 
        configCommands.selectPort()
      ),
      // 注意：manageSiFliSdk 已在外部注册，无论是否为 SiFli 项目
      vscode.commands.registerCommand(CMD_PREFIX + 'switchSdkVersion', () => 
        configCommands.switchSdkVersion()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'openDeviceMonitor', () => 
        statusBarProvider.openDeviceMonitor()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'closeDeviceMonitor', () => 
        statusBarProvider.closeDeviceMonitor()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'listSerialPorts', () => 
        configCommands.listSerialPorts()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'configureClangd', () => 
        configCommands.configureClangd()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'showLogs', () => {
        logService.show();
        logService.info('Logs displayed by user request');
      })
    ];

    context.subscriptions.push(...commands);

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
export function deactivate(): void {
  const logService = LogService.getInstance();
  logService.info('SiFli SDK CodeKit extension is deactivating...');
  
  // 清理状态栏
  const statusBarProvider = StatusBarProvider.getInstance();
  statusBarProvider.dispose();
  
  // 清理侧边栏
  const sidebarManager = SifliSidebarManager.getInstance();
  sidebarManager.dispose();
  
  // 清理终端
  const terminalService = TerminalService.getInstance();
  terminalService.disposeSiFliTerminals();
  
  // 清理 Git 服务
  const gitService = GitService.getInstance();
  gitService.dispose();
  
  // 清理日志服务
  logService.info('SiFli SDK CodeKit extension deactivated');
  logService.dispose();
}
