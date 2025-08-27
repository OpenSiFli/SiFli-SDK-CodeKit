import * as vscode from 'vscode';
import { CMD_PREFIX, HAS_RUN_INITIAL_SETUP_KEY } from './constants';
import { ConfigService } from './services/configService';
import { SdkService } from './services/sdkService';
import { GitService } from './services/gitService';
import { SerialPortService } from './services/serialPortService';
import { TerminalService } from './services/terminalService';
import { LogService } from './services/logService';
import { BuildCommands } from './commands/buildCommands';
import { ConfigCommands } from './commands/configCommands';
import { SdkCommands } from './commands/sdkCommands';
import { StatusBarProvider } from './providers/statusBarProvider';
import { VueWebviewProvider } from './providers/vueWebviewProvider';
import { isSiFliProject } from './utils/projectUtils';

/**
 * 扩展激活函数
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 初始化日志服务
  const logService = LogService.getInstance();
  
  logService.info('SiFli SDK CodeKit extension is activating...');

  // *** 仅在开发调试时使用：强制重置首次运行标志 ***
  // 这将使得每次"重新运行调试"时,Quick Pick 都会弹出。
  // 在发布生产版本时,请务必删除或注释掉此行！
  await context.globalState.update(HAS_RUN_INITIAL_SETUP_KEY, false);
  // ******************************************************

  // 初始化服务
  const configService = ConfigService.getInstance();
  const sdkService = SdkService.getInstance();
  const gitService = GitService.getInstance();
  const serialPortService = SerialPortService.getInstance();
  const terminalService = TerminalService.getInstance();
  
  // 初始化命令处理器
  const buildCommands = BuildCommands.getInstance();
  const configCommands = ConfigCommands.getInstance();
  const sdkCommands = SdkCommands.getInstance();
  
  // 初始化状态栏提供者
  const statusBarProvider = StatusBarProvider.getInstance();
  
  // 初始化 Vue WebView 提供者
  const vueWebviewProvider = VueWebviewProvider.getInstance();

  // 注册输出通道和 Git 输出通道到订阅列表
  context.subscriptions.push(
    logService.getOutputChannel(),
    gitService.getOutputChannel()
  );

  // 在插件激活时立即读取配置
  await configService.updateConfiguration();
  logService.info('Configuration loaded successfully');
  
  // 初始化串口服务（恢复之前保存的串口选择）
  await serialPortService.initialize();
  
  // 发现 SDK 版本
  const sdkVersions = await sdkService.discoverSiFliSdks();
  configService.detectedSdkVersions = sdkVersions;
  logService.info(`Discovered ${sdkVersions.length} SDK versions`);

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

    // 注册命令
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
      vscode.commands.registerCommand(CMD_PREFIX + 'selectDownloadPort', () => 
        configCommands.selectDownloadPort()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'manageSiFliSdk', () => 
        vueWebviewProvider.createSdkManagementWebview(context)
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'switchSdkVersion', () => 
        configCommands.switchSdkVersion()
      ),
      vscode.commands.registerCommand(CMD_PREFIX + 'openDeviceMonitor', () => 
        statusBarProvider.openDeviceMonitor()
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
