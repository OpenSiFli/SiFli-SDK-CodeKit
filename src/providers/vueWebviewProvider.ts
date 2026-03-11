// 文件名: vueWebviewProvider.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { TerminalService } from '../services/terminalService';
import { SdkService } from '../services/sdkService';
import { GitService } from '../services/gitService';
import { ConfigService } from '../services/configService';
import { LogService } from '../services/logService';
import { RegionService } from '../services/regionService';

export class VueWebviewProvider {
  private static instance: VueWebviewProvider;
  private terminalService: TerminalService;
  private logService: LogService;

  private constructor() {
    this.terminalService = TerminalService.getInstance();
    this.logService = LogService.getInstance();
  }

  public static getInstance(): VueWebviewProvider {
    if (!VueWebviewProvider.instance) {
      VueWebviewProvider.instance = new VueWebviewProvider();
    }
    return VueWebviewProvider.instance;
  }

  /**
   * 创建 Vue SDK 管理 WebView
   */
  public async createSdkManagementWebview(context: vscode.ExtensionContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel('sifliSdkManagerVue', 'SiFli SDK 管理器', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      enableCommandUris: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, 'webview-vue', 'dist')),
        vscode.Uri.file(path.join(context.extensionPath, 'webview-vue', 'dist', 'assets')),
      ],
    });

    // 设置 WebView 内容
    panel.webview.html = this.getWebviewContent(panel.webview, context.extensionPath);

    // 发送初始化数据，包括语言设置
    panel.webview.onDidReceiveMessage(
      async message => {
        if (message.command === 'ready') {
          // 当 webview 准备就绪时发送初始化数据
          const locale = this.getVSCodeLocale();
          panel.webview.postMessage({
            command: 'initializeLocale',
            locale: locale,
          });
          // 发送区域默认源设置（仅在需要时）
          this.sendRegionDefaults(panel.webview).catch(err => {
            console.error('[VueWebviewProvider] Failed to send region defaults:', err);
          });
        } else {
          try {
            await this.handleWebviewMessage(message, panel.webview);
          } catch (error) {
            console.error('[VueWebviewProvider] Error handling webview message:', error);
            panel.webview.postMessage({
              command: 'error',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      },
      undefined,
      context.subscriptions
    );

    // 监听 VS Code 语言配置变化
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('locale')) {
        const locale = this.getVSCodeLocale();
        panel.webview.postMessage({
          command: 'localeChanged',
          locale: locale,
        });
      }
    });

    panel.onDidDispose(() => {
      configChangeListener.dispose();

      // 关闭WebView时终止所有Git进程
      console.log('[VueWebviewProvider] WebView disposed, terminating Git processes...');
      this.terminateGitProcesses();
    });
  }

  /**
   * 终止所有Git进程
   */
  private async terminateGitProcesses(): Promise<void> {
    try {
      const { GitService } = await import('../services/gitService');
      const gitService = GitService.getInstance();
      gitService.terminateAllProcesses();
    } catch (error) {
      console.error('[VueWebviewProvider] Error terminating Git processes:', error);
    }
  }

  /**
   * 获取 VS Code 的语言设置
   */
  private getVSCodeLocale(): string {
    // 获取 VS Code 的语言设置
    const config = vscode.workspace.getConfiguration();
    const locale = config.get<string>('locale') || vscode.env.language || 'en';

    // 将 VS Code 的语言代码映射到我们支持的语言
    if (locale.startsWith('zh')) {
      return 'zh';
    }
    return 'en';
  }

  /**
   * 获取 Vue WebView HTML 内容
   */
  private getWebviewContent(webview: vscode.Webview, extensionPath: string): string {
    const vueDistPath = path.join(extensionPath, 'webview-vue', 'dist');
    const templatePath = path.join(extensionPath, 'src', 'providers', 'templates', 'webview.html');

    console.log('[VueWebviewProvider] Vue dist path:', vueDistPath);
    console.log('[VueWebviewProvider] Template path:', templatePath);

    // 获取资源 URI
    const getResourceUri = (relativePath: string) => {
      const fullPath = path.join(vueDistPath, relativePath);
      console.log('[VueWebviewProvider] Checking resource:', fullPath);
      const exists = fs.existsSync(fullPath);
      console.log('[VueWebviewProvider] Resource exists:', exists);

      if (exists) {
        const uri = webview.asWebviewUri(vscode.Uri.file(fullPath)).toString();
        console.log('[VueWebviewProvider] Resource URI:', uri);
        return uri;
      }
      return null;
    };

    const jsUri = getResourceUri('assets/index.js');
    const cssFiles = fs.existsSync(path.join(vueDistPath, 'assets'))
      ? fs.readdirSync(path.join(vueDistPath, 'assets')).filter(f => f.endsWith('.css'))
      : [];

    console.log('[VueWebviewProvider] CSS files found:', cssFiles);

    const cssUris = cssFiles.map(file => getResourceUri(`assets/${file}`)).filter(Boolean);

    if (!jsUri) {
      console.error('[VueWebviewProvider] Vue script not found');
      return this.getErrorWebviewContent('Vue 应用脚本文件未找到，请运行 yarn build:webview');
    }

    if (!fs.existsSync(templatePath)) {
      console.error('[VueWebviewProvider] Template not found');
      return this.getErrorWebviewContent('Webview 模板文件未找到');
    }

    try {
      let html = fs.readFileSync(templatePath, 'utf8');

      // 添加 CSS 链接
      const cssLinks = cssUris.map(uri => `<link rel="stylesheet" href="${uri}">`).join('\n  ');

      // 替换模板变量
      html = html.replace('{{VUE_SCRIPT_URI}}', jsUri);
      html = html.replace('</head>', `  ${cssLinks}\n</head>`);

      console.log('[VueWebviewProvider] Generated HTML preview:', html.substring(0, 500));
      return html;
    } catch (error) {
      console.error('[VueWebviewProvider] Error reading template:', error);
      return this.getErrorWebviewContent('读取 Webview 模板失败');
    }
  }

  /**
   * 获取错误页面内容
   */
  private getErrorWebviewContent(message: string): string {
    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>错误</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            text-align: center;
          }
          .error {
            color: var(--vscode-errorForeground);
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <h1>加载失败</h1>
        <div class="error">${message}</div>
        <p>请检查 webview-vue 项目是否已正确构建。</p>
      </body>
      </html>
    `;
  }

  /**
   * 处理来自 WebView 的消息
   */
  private async handleWebviewMessage(message: any, webview: vscode.Webview): Promise<void> {
    const { SdkCommands } = await import('../commands/sdkCommands');
    const { SdkService } = await import('../services/sdkService');
    const { GitService } = await import('../services/gitService');
    const { ConfigService } = await import('../services/configService'); // 确保这里有 ConfigService 的引用

    const sdkCommands = SdkCommands.getInstance();
    const sdkService = SdkService.getInstance();
    const gitService = GitService.getInstance();
    const configService = ConfigService.getInstance(); // 获取 ConfigService 实例

    switch (message.command) {
      case 'getSdkList':
        const sdks = await sdkService.discoverSiFliSdks();
        webview.postMessage({
          command: 'updateSdkList',
          sdks,
        });
        break;

      case 'fetchVersions':
        try {
          // 在后端调用统一的版本 API，避免 webview 的 CORS 问题
          const response = await fetch('https://downloads.sifli.com/dl/sifli-sdk/version.json');
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const versions = await response.json();
          webview.postMessage({
            command: 'displayVersions',
            versions,
          });
        } catch (error) {
          console.error('[VueWebviewProvider] Error fetching unified versions:', error);
          webview.postMessage({
            command: 'error',
            message: '获取版本列表失败: ' + (error instanceof Error ? error.message : String(error)),
          });
        }
        break;

      case 'browseInstallPath':
        try {
          const result = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: '选择 SDK 安装目录',
          });

          if (result && result.length > 0) {
            webview.postMessage({
              command: 'installPathSelected',
              path: result[0].fsPath,
            });
          }
        } catch (error) {
          console.error('[VueWebviewProvider] Error browsing path:', error);
          webview.postMessage({
            command: 'error',
            message: '选择路径失败: ' + (error instanceof Error ? error.message : String(error)),
          });
        }
        break;

      case 'browseToolsPath':
        try {
          const result = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: '选择工具链目录',
          });

          if (result && result.length > 0) {
            webview.postMessage({
              command: 'toolsPathSelected',
              path: result[0].fsPath,
            });
          }
        } catch (error) {
          console.error('[VueWebviewProvider] Error browsing tools path:', error);
          webview.postMessage({
            command: 'error',
            message: '选择工具链路径失败: ' + (error instanceof Error ? error.message : String(error)),
          });
        }
        break;

      case 'installSdk':
        // 创建安装日志数组来收集所有日志（需在 try 外声明以便 catch 使用）
        const installationLogs: string[] = [];
        try {
          console.log('[VueWebviewProvider] Starting SDK installation...');
          const { sdkSource, version, installPath, toolchainSource, toolsPath } = message.data;

          console.log('[VueWebviewProvider] Installation parameters:', {
            sdkSource,
            version,
            installPath,
            toolchainSource,
            toolsPath,
          });

          // 辅助函数：发送日志并收集
          const sendLog = (log: string) => {
            installationLogs.push(log);
            webview.postMessage({
              command: 'installationLog',
              log: log,
            });
          };

          // 存储工具链路径以便后续使用
          const toolsPathForEnv = toolsPath && toolsPath.trim() !== '' ? toolsPath.trim() : null;

          if (toolsPathForEnv) {
            console.log('[VueWebviewProvider] Tools path provided:', toolsPathForEnv);
            sendLog(`🔧 检测到工具链路径: ${toolsPathForEnv}`);
            sendLog(`🔧 将在脚本执行时设置环境变量 SIFLI_SDK_TOOLS_PATH`);
          } else {
            console.log('[VueWebviewProvider] No tools path provided');
            sendLog(`ℹ️  未设置工具链路径，将使用默认环境`);
          }
          // 首先检查 Git 是否可用
          const isGitAvailable = await gitService.isGitInstalled();
          if (!isGitAvailable) {
            throw new Error('Git 未安装或不在系统 PATH 中。请先安装 Git。');
          }
          console.log('[VueWebviewProvider] Git is available');

          // 发送安装开始消息
          webview.postMessage({
            command: 'installationStarted',
            message: '开始安装 SiFli SDK...',
          });

          // 确定仓库 URL
          const repoUrl =
            sdkSource === 'github'
              ? 'https://github.com/OpenSiFli/SiFli-SDK.git'
              : 'https://gitee.com/SiFli/sifli-sdk.git';

          console.log('[VueWebviewProvider] Repository URL:', repoUrl);

          // 修正目录名，确保与前端显示一致
          const dirName = version.name === 'latest' ? 'main' : version.name;

          // 创建安装目录 - 修正路径结构为 installPath/SiFli-SDK/dirName
          const sdkBasePath = path.join(installPath, 'SiFli-SDK');
          const fullInstallPath = path.join(sdkBasePath, dirName);

          console.log('[VueWebviewProvider] SDK base path:', sdkBasePath);
          console.log('[VueWebviewProvider] Full install path:', fullInstallPath);

          // 发送日志消息
          sendLog(`🚀 准备安装 SiFli SDK ${dirName}`);
          sendLog(`🔗 源码仓库: ${repoUrl}`);
          sendLog(`📂 安装路径: ${fullInstallPath}`);

          // 确保 SiFli-SDK 基础目录存在
          if (!fs.existsSync(sdkBasePath)) {
            console.log('[VueWebviewProvider] Creating SDK base directory:', sdkBasePath);
            fs.mkdirSync(sdkBasePath, { recursive: true });
            sendLog(`📁 创建基础目录: ${sdkBasePath}`);
          }

          // 检查具体版本目录是否已存在
          if (fs.existsSync(fullInstallPath)) {
            console.log('[VueWebviewProvider] Directory already exists, will overwrite');
            sendLog(`⚠️  目标目录已存在，将进行覆盖安装`);
          }

          sendLog(`🔄 开始克隆仓库（包含子模块）...`);

          console.log('[VueWebviewProvider] Starting clone operation...');

          // 确保 'latest' 被转换为 'main' ===
          let branchName = version.type === 'release' ? version.tagName : version.name;
          if (branchName === 'latest') {
            branchName = 'main';
            console.log('[VueWebviewProvider] Corrected branch name from "latest" to "main"');
            sendLog(`🔀 分支名称已从 "latest" 修正为 "main"`);
          }

          // 使用 GitService 克隆仓库，包含 --recursive 选项
          await gitService.cloneRepository(repoUrl, fullInstallPath, {
            branch: branchName,
            onProgress: progress => {
              console.log('[VueWebviewProvider] Clone progress:', progress);
              // 发送 Git 日志到前端并收集
              const logMessage = progress;
              installationLogs.push(logMessage);
              webview.postMessage({
                command: 'installationLog',
                log: logMessage,
              });
            },
          });

          console.log('[VueWebviewProvider] Clone operation completed');

          sendLog('🎉 Git 克隆操作完成！');

          // 自动安装工具链
          await this.installToolchain(fullInstallPath, webview, installationLogs, toolsPathForEnv, toolchainSource);

          // === 核心修改部分 ===
          // 在 SDK 成功安装后，将路径添加到配置中
          await configService.addSdkConfig(fullInstallPath, toolsPathForEnv);
          // ====================

          // 如果设置了工具链路径，保存到配置中（与SDK路径绑定）
          if (toolsPathForEnv) {
            try {
              await configService.setSdkToolsPath(fullInstallPath, toolsPathForEnv);
              sendLog(`💾 工具链路径已绑定到SDK: ${fullInstallPath} -> ${toolsPathForEnv}`);
            } catch (error) {
              console.error('[VueWebviewProvider] Failed to save tools path to config:', error);
              sendLog(`⚠️ 保存工具链路径到配置失败: ${error instanceof Error ? error.message : String(error)}`);
            }
          }

          sendLog(`✅ SiFli SDK ${dirName} 安装成功！`);
          sendLog(`📁 安装路径: ${fullInstallPath}`);

          // 发送安装成功消息，包含详细信息
          webview.postMessage({
            command: 'installationCompleted',
            message: `SiFli SDK ${dirName} 安装成功！`,
            path: fullInstallPath,
            version: dirName,
            source: sdkSource,
            logs: installationLogs,
          });

          console.log('[VueWebviewProvider] SDK installation completed successfully');
        } catch (error) {
          console.error('[VueWebviewProvider] SDK installation failed:', error);

          // 安装失败时终止Git进程
          await this.terminateGitProcesses();

          // 发送错误日志
          const errorMessage = `❌ 安装失败: ${error instanceof Error ? error.message : String(error)}`;
          installationLogs.push(errorMessage);
          webview.postMessage({
            command: 'installationLog',
            log: errorMessage,
          });

          webview.postMessage({
            command: 'installationFailed',
            message: '安装失败: ' + (error instanceof Error ? error.message : String(error)),
            logs: installationLogs,
          });
        }
        break;

      case 'cancelInstallation':
        try {
          console.log('[VueWebviewProvider] Cancelling SDK installation...');

          // 终止所有Git进程
          await this.terminateGitProcesses();

          webview.postMessage({
            command: 'installationLog',
            log: '⚠️ 用户取消了安装操作',
          });

          webview.postMessage({
            command: 'installationFailed',
            message: '安装已取消',
            logs: [],
          });
        } catch (error) {
          console.error('[VueWebviewProvider] Error cancelling installation:', error);
          webview.postMessage({
            command: 'installationLog',
            log: `❌ 取消安装时发生错误: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        break;

      case 'getDefaultInstallPath':
        try {
          const os = require('os');
          const path = require('path');
          const homeDir = os.homedir();
          const defaultPath = path.join(homeDir, 'sifli');

          webview.postMessage({
            command: 'defaultInstallPath',
            path: defaultPath,
          });
        } catch (error) {
          console.error('[VueWebviewProvider] Error getting default install path:', error);
          // 如果获取失败，发送一个通用默认路径
          webview.postMessage({
            command: 'defaultInstallPath',
            path: '~/sifli',
          });
        }
        break;

      case 'openInExplorer':
        try {
          const { path: targetPath } = message;
          if (targetPath && fs.existsSync(targetPath)) {
            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(targetPath));
          } else {
            vscode.window.showErrorMessage(vscode.l10n.t('Target path does not exist.'));
          }
        } catch (error) {
          console.error('[VueWebviewProvider] Error opening in explorer:', error);
          vscode.window.showErrorMessage(vscode.l10n.t('Failed to open file explorer.'));
        }
        break;

      case 'openInTerminal':
        try {
          const { path: targetPath } = message;
          if (targetPath && fs.existsSync(targetPath)) {
            const terminal = vscode.window.createTerminal({
              name: vscode.l10n.t('SiFli SDK'),
              cwd: targetPath,
            });
            terminal.show();
          } else {
            vscode.window.showErrorMessage(vscode.l10n.t('Target path does not exist.'));
          }
        } catch (error) {
          console.error('[VueWebviewProvider] Error opening in terminal:', error);
          vscode.window.showErrorMessage(vscode.l10n.t('Failed to open terminal.'));
        }
        break;

      case 'closeManager':
        try {
          // 关闭当前的webview panel
          vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        } catch (error) {
          console.error('[VueWebviewProvider] Error closing manager:', error);
        }
        break;

      case 'validateExistingSdk':
        try {
          const { path: sdkPath } = message;
          await this.validateExistingSdk(sdkPath, webview);
        } catch (error) {
          console.error('[VueWebviewProvider] Error validating SDK:', error);
          webview.postMessage({
            command: 'sdkValidationResult',
            valid: false,
            message: '验证 SDK 时发生错误: ' + (error instanceof Error ? error.message : String(error)),
          });
        }
        break;

      case 'installExistingSdk':
        try {
          const { data } = message;
          await this.installExistingSdk(data.sdkPath, data.toolchainSource, data.toolsPath || '', webview);
        } catch (error) {
          console.error('[VueWebviewProvider] Error installing existing SDK:', error);
          webview.postMessage({
            command: 'installationFailed',
            message: '安装 SDK 失败: ' + (error instanceof Error ? error.message : String(error)),
          });
        }
        break;

      default:
        console.warn('[VueWebviewProvider] Unknown command:', message.command);
    }
  }

  /**
   * 安装工具链
   */
  private async installToolchain(
    sdkPath: string,
    webview: vscode.Webview,
    installationLogs?: string[],
    toolsPath?: string | null,
    toolchainSource?: string
  ): Promise<void> {
    try {
      console.log('[VueWebviewProvider] Starting toolchain installation...');
      const logMessage = '🔧 开始安装工具链...';
      if (installationLogs) {
        installationLogs.push(logMessage);
      }
      webview.postMessage({
        command: 'installationLog',
        log: logMessage,
      });

      // 如果设置了工具链路径，记录环境变量信息
      if (toolsPath) {
        const envLog = `🔧 设置环境变量 SIFLI_SDK_TOOLS_PATH=${toolsPath}`;
        if (installationLogs) {
          installationLogs.push(envLog);
        }
        webview.postMessage({
          command: 'installationLog',
          log: envLog,
        });
      }

      // 确定安装脚本路径
      const installScript = this.getInstallScriptPath(sdkPath);
      if (!installScript) {
        const logMessage = '⚠️ 未找到工具链安装脚本，跳过工具链安装';
        if (installationLogs) {
          installationLogs.push(logMessage);
        }
        webview.postMessage({
          command: 'installationLog',
          log: logMessage,
        });
        return;
      }

      const foundScriptLog = `📜 找到安装脚本: ${path.basename(installScript)}`;
      if (installationLogs) {
        installationLogs.push(foundScriptLog);
      }
      webview.postMessage({
        command: 'installationLog',
        log: foundScriptLog,
      });

      // 执行安装脚本
      await this.executeInstallScript(installScript, sdkPath, webview, installationLogs, toolsPath, toolchainSource);

      const completedLog = '✅ 工具链安装完成！';
      if (installationLogs) {
        installationLogs.push(completedLog);
      }
      webview.postMessage({
        command: 'installationLog',
        log: completedLog,
      });
    } catch (error) {
      console.error('[VueWebviewProvider] Toolchain installation failed:', error);
      const errorLog = `❌ 工具链安装失败: ${error instanceof Error ? error.message : String(error)}`;
      if (installationLogs) {
        installationLogs.push(errorLog);
      }
      webview.postMessage({
        command: 'installationLog',
        log: errorLog,
      });
      // 不抛出错误，让SDK安装继续完成
    }
  }

  /**
   * 获取安装脚本路径
   */
  private getInstallScriptPath(sdkPath: string): string | null {
    if (process.platform === 'win32') {
      // Windows 平台查找 install.ps1
      const ps1Script = path.join(sdkPath, 'install.ps1');
      if (fs.existsSync(ps1Script)) {
        return ps1Script;
      }
    } else {
      // Unix-like 系统查找 install.sh
      const shScript = path.join(sdkPath, 'install.sh');
      if (fs.existsSync(shScript)) {
        return shScript;
      }
    }
    return null;
  }

  /**
   * 执行安装脚本
   */
  private async executeInstallScript(
    scriptPath: string,
    workingDir: string,
    webview: vscode.Webview,
    installationLogs?: string[],
    toolsPath?: string | null,
    toolchainSource?: string
  ): Promise<void> {
    // 提前获取 PythonService
    let pythonDir: string | undefined;
    if (process.platform === 'win32') {
      try {
        const { PythonService } = await import('../services/pythonService');
        pythonDir = PythonService.getInstance().getPythonDir();
      } catch (e) {
        this.logService.error('[VueWebviewProvider] Error loading PythonService:', e);
      }
    }

    return new Promise((resolve, reject) => {
      let command: string;
      let args: string[];

      if (process.platform === 'win32') {
        // Windows 使用配置的 PowerShell 路径执行 .ps1 脚本
        command = this.terminalService.getPowerShellExecutablePath();
        args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath];
      } else {
        // Unix-like 系统使用 bash 执行 .sh 脚本
        command = 'bash';
        args = [scriptPath];
      }

      console.log(`[VueWebviewProvider] Executing: ${command} ${args.join(' ')}`);
      const execLog = `🏃 执行命令: ${command} ${args.join(' ')}`;
      if (installationLogs) {
        installationLogs.push(execLog);
      }
      webview.postMessage({
        command: 'installationLog',
        log: execLog,
      });

      // 设置环境变量
      const env = { ...process.env };

      // 注入嵌入式 Python 路径 (仅限 Windows)
      if (process.platform === 'win32' && pythonDir) {
        const currentPath = env.PATH || env.Path || '';
        const pythonScriptsDir = path.join(pythonDir, 'Scripts');
        env.PATH = `${pythonDir};${pythonScriptsDir};${currentPath}`;
        const pythonLog = `🐍 注入嵌入式 Python 路径: ${pythonDir}`;
        if (installationLogs) {
          installationLogs.push(pythonLog);
        }
        webview.postMessage({
          command: 'installationLog',
          log: pythonLog,
        });
      }

      if (toolsPath) {
        env.SIFLI_SDK_TOOLS_PATH = toolsPath;
        const envSetLog = `🔧 环境变量已设置: SIFLI_SDK_TOOLS_PATH=${toolsPath}`;
        if (installationLogs) {
          installationLogs.push(envSetLog);
        }
        webview.postMessage({
          command: 'installationLog',
          log: envSetLog,
        });
      }

      // 根据工具链下载源设置额外的环境变量
      // 当用户选择 'sifli' 镜像源时设置镜像环境变量
      if (toolchainSource === 'sifli') {
        // SiFli镜像源时设置额外的环境变量
        env.SIFLI_SDK_GITHUB_ASSETS = 'downloads.sifli.com/github_assets';
        env.PIP_INDEX_URL = 'https://mirrors.ustc.edu.cn/pypi/simple';

        const mirrorLogMessage = `🌐 检测到SiFli镜像源，设置镜像环境变量:`;
        const githubAssetsLog = `   SIFLI_SDK_GITHUB_ASSETS=downloads.sifli.com/github_assets`;
        const pipIndexLog = `   PIP_INDEX_URL=https://mirrors.ustc.edu.cn/pypi/simple`;

        if (installationLogs) {
          installationLogs.push(mirrorLogMessage);
          installationLogs.push(githubAssetsLog);
          installationLogs.push(pipIndexLog);
        }
        webview.postMessage({
          command: 'installationLog',
          log: mirrorLogMessage,
        });
        webview.postMessage({
          command: 'installationLog',
          log: githubAssetsLog,
        });
        webview.postMessage({
          command: 'installationLog',
          log: pipIndexLog,
        });
      }

      const installProcess = spawn(command, args, {
        cwd: workingDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: env,
      });

      let hasError = false;
      let errorOutput = '';

      // 处理标准输出
      installProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[VueWebviewProvider] Install stdout: ${output}`);
          if (installationLogs) {
            installationLogs.push(output);
          }
          webview.postMessage({
            command: 'installationLog',
            log: output,
          });
        }
      });

      // 处理错误输出
      installProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[VueWebviewProvider] Install stderr: ${output}`);
          errorOutput += output + '\n';
          // 不是所有stderr输出都是错误（有些程序用stderr输出普通信息）
          if (installationLogs) {
            installationLogs.push(output);
          }
          webview.postMessage({
            command: 'installationLog',
            log: output,
          });
        }
      });

      // 处理进程退出
      installProcess.on('close', (code: number) => {
        console.log(`[VueWebviewProvider] Install script exited with code: ${code}`);

        if (code === 0) {
          const successLog = `✅ 安装脚本执行成功（退出代码: ${code}）`;
          if (installationLogs) {
            installationLogs.push(successLog);
          }
          webview.postMessage({
            command: 'installationLog',
            log: successLog,
          });
          resolve();
        } else {
          const errorMessage = `安装脚本执行失败，退出代码: ${code}`;
          console.error(`[VueWebviewProvider] ${errorMessage}`);

          if (errorOutput) {
            console.error(`[VueWebviewProvider] Error details: ${errorOutput}`);
          }

          const errorLog = `❌ ${errorMessage}`;
          if (installationLogs) {
            installationLogs.push(errorLog);
          }
          webview.postMessage({
            command: 'installationLog',
            log: errorLog,
          });

          if (errorOutput) {
            const errorDetailLog = `错误详情: ${errorOutput}`;
            if (installationLogs) {
              installationLogs.push(errorDetailLog);
            }
            webview.postMessage({
              command: 'installationLog',
              log: errorDetailLog,
            });
          }

          reject(new Error(`${errorMessage}${errorOutput ? '\n' + errorOutput : ''}`));
        }
      });

      // 处理进程错误
      installProcess.on('error', (error: Error) => {
        console.error(`[VueWebviewProvider] Install process error:`, error);
        const processErrorLog = `❌ 进程启动失败: ${error.message}`;
        if (installationLogs) {
          installationLogs.push(processErrorLog);
        }
        webview.postMessage({
          command: 'installationLog',
          log: processErrorLog,
        });
        reject(error);
      });

      // 设置超时（10分钟）
      setTimeout(
        () => {
          if (!installProcess.killed) {
            console.log(`[VueWebviewProvider] Install script timeout, killing process...`);
            const timeoutLog = '⏰ 安装脚本执行超时，正在终止...';
            if (installationLogs) {
              installationLogs.push(timeoutLog);
            }
            webview.postMessage({
              command: 'installationLog',
              log: timeoutLog,
            });
            installProcess.kill();
            reject(new Error('安装脚本执行超时'));
          }
        },
        10 * 60 * 1000
      ); // 10分钟超时
    });
  }

  /**
   * 验证已存在的 SDK 路径
   */
  private async validateExistingSdk(sdkPath: string, webview: vscode.Webview): Promise<void> {
    try {
      console.log('[VueWebviewProvider] Validating SDK path:', sdkPath);

      if (!fs.existsSync(sdkPath)) {
        webview.postMessage({
          command: 'sdkValidationResult',
          valid: false,
          message: 'SDK 路径不存在',
        });
        return;
      }

      // 检查必要的文件
      const requiredFiles = [
        { path: 'tools/sdk.py', name: 'SDK 工具脚本' },
        { path: 'version.txt', name: '版本文件' },
        { path: 'install.sh', name: '安装脚本' },
        { path: 'export.sh', name: '环境变量脚本' },
      ];

      const missingFiles: string[] = [];
      for (const file of requiredFiles) {
        const filePath = path.join(sdkPath, file.path);
        if (!fs.existsSync(filePath)) {
          missingFiles.push(file.name);
        }
      }

      if (missingFiles.length > 0) {
        webview.postMessage({
          command: 'sdkValidationResult',
          valid: false,
          message: `缺少必要文件: ${missingFiles.join(', ')}`,
        });
        return;
      }

      // 从 Git 获取版本信息
      let version = 'Unknown';
      try {
        const { GitService } = await import('../services/gitService');
        const gitService = GitService.getInstance();

        const isRepo = await gitService.isRepository(sdkPath);
        if (isRepo) {
          version = await gitService.getCurrentBranch(sdkPath);
          console.log('[VueWebviewProvider] SDK version from git:', version);
        } else {
          // 如果不是 git 仓库，尝试从 version.txt 读取
          const versionFilePath = path.join(sdkPath, 'version.txt');
          if (fs.existsSync(versionFilePath)) {
            version = fs.readFileSync(versionFilePath, 'utf8').trim();
          }
        }
      } catch (error) {
        console.error('[VueWebviewProvider] Error getting SDK version:', error);
      }

      webview.postMessage({
        command: 'sdkValidationResult',
        valid: true,
        message: 'SDK 验证成功',
        version,
      });
    } catch (error) {
      console.error('[VueWebviewProvider] Error validating SDK:', error);
      webview.postMessage({
        command: 'sdkValidationResult',
        valid: false,
        message: '验证过程出错: ' + (error instanceof Error ? error.message : String(error)),
      });
    }
  }

  /**
   * 安装已存在的 SDK
   */
  private async installExistingSdk(
    sdkPath: string,
    toolchainSource: string,
    toolsPath: string,
    webview: vscode.Webview
  ): Promise<void> {
    const installationLogs: string[] = [];
    try {
      console.log('[VueWebviewProvider] Installing existing SDK:', sdkPath);

      const sendLog = (log: string) => {
        installationLogs.push(log);
        webview.postMessage({
          command: 'installationLog',
          log: log,
        });
      };

      webview.postMessage({
        command: 'installationStarted',
        message: '开始配置 SDK...',
      });

      sendLog(`📂 SDK 路径: ${sdkPath}`);

      if (toolsPath && toolsPath.trim() !== '') {
        sendLog(`🔧 工具链路径: ${toolsPath}`);
      }

      // 获取版本信息
      let version = 'Unknown';
      try {
        const { GitService } = await import('../services/gitService');
        const gitService = GitService.getInstance();

        const isRepo = await gitService.isRepository(sdkPath);
        if (isRepo) {
          version = await gitService.getCurrentBranch(sdkPath);
          sendLog(`📌 检测到版本: ${version}`);
        }
      } catch (error) {
        console.error('[VueWebviewProvider] Error getting version:', error);
      }

      // 执行安装脚本
      await this.installToolchain(sdkPath, webview, installationLogs, toolsPath || null, toolchainSource);

      // 添加 SDK 到配置
      const { ConfigService } = await import('../services/configService');
      const configService = ConfigService.getInstance();

      await configService.addSdkConfig(sdkPath, toolsPath || undefined);
      sendLog(`💾 SDK 已添加到配置`);

      // 如果设置了工具链路径，保存到配置中
      if (toolsPath && toolsPath.trim() !== '') {
        await configService.setSdkToolsPath(sdkPath, toolsPath);
        sendLog(`💾 工具链路径已保存`);
      }

      sendLog(`✅ SDK 安装配置完成！`);

      webview.postMessage({
        command: 'installationCompleted',
        message: `SDK 安装配置成功！`,
        path: sdkPath,
        version: version,
        source: 'local',
        logs: installationLogs,
      });
    } catch (error) {
      console.error('[VueWebviewProvider] Error installing existing SDK:', error);
      webview.postMessage({
        command: 'installationFailed',
        message: '安装失败: ' + (error instanceof Error ? error.message : String(error)),
        logs: installationLogs,
      });
    }
  }

  /**
   * 向 WebView 发送区域默认选项（中国用户默认 Gitee/Sifli 源）
   */
  private async sendRegionDefaults(webview: vscode.Webview): Promise<void> {
    try {
      const regionService = RegionService.getInstance();
      const inChina = await regionService.isUserInChina();
      if (inChina) {
        webview.postMessage({
          command: 'setDefaultSources',
          sdkSource: 'gitee',
          toolchainSource: 'sifli',
        });
      }
    } catch (error) {
      console.error('[VueWebviewProvider] Failed to send region defaults:', error);
    }
  }
}
