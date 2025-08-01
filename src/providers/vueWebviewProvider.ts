import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class VueWebviewProvider {
  private static instance: VueWebviewProvider;

  private constructor() {}

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
    const panel = vscode.window.createWebviewPanel(
      'sifliSdkManagerVue',
      'SiFli SDK 管理器',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableCommandUris: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'webview-vue', 'dist')),
          vscode.Uri.file(path.join(context.extensionPath, 'webview-vue', 'dist', 'assets'))
        ]
      }
    );

    // 设置 WebView 内容
    panel.webview.html = this.getWebviewContent(panel.webview, context.extensionPath);

    // 发送初始化数据，包括语言设置
    panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.command === 'ready') {
          // 当 webview 准备就绪时发送初始化数据
          const locale = this.getVSCodeLocale();
          panel.webview.postMessage({
            command: 'initializeLocale',
            locale: locale
          });
        } else {
          try {
            await this.handleWebviewMessage(message, panel.webview);
          } catch (error) {
            console.error('[VueWebviewProvider] Error handling webview message:', error);
            panel.webview.postMessage({
              command: 'error',
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      },
      undefined,
      context.subscriptions
    );

    // 监听 VS Code 语言配置变化
    const configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('locale')) {
        const locale = this.getVSCodeLocale();
        panel.webview.postMessage({
          command: 'localeChanged',
          locale: locale
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
    
    const sdkCommands = SdkCommands.getInstance();
    const sdkService = SdkService.getInstance();
    const gitService = GitService.getInstance();

    switch (message.command) {
      case 'getSdkList':
        const sdks = await sdkService.discoverSiFliSdks();
        webview.postMessage({
          command: 'updateSdkList',
          sdks
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
            versions
          });
        } catch (error) {
          console.error('[VueWebviewProvider] Error fetching unified versions:', error);
          webview.postMessage({
            command: 'error',
            message: '获取版本列表失败: ' + (error instanceof Error ? error.message : String(error))
          });
        }
        break;

      case 'browseInstallPath':
        try {
          const result = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: '选择 SDK 安装目录'
          });
          
          if (result && result.length > 0) {
            webview.postMessage({
              command: 'installPathSelected',
              path: result[0].fsPath
            });
          }
        } catch (error) {
          console.error('[VueWebviewProvider] Error browsing path:', error);
          webview.postMessage({
            command: 'error',
            message: '选择路径失败: ' + (error instanceof Error ? error.message : String(error))
          });
        }
        break;

      case 'browseToolsPath':
        try {
          const result = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: '选择工具链目录'
          });
          
          if (result && result.length > 0) {
            webview.postMessage({
              command: 'toolsPathSelected',
              path: result[0].fsPath
            });
          }
        } catch (error) {
          console.error('[VueWebviewProvider] Error browsing tools path:', error);
          webview.postMessage({
            command: 'error',
            message: '选择工具链路径失败: ' + (error instanceof Error ? error.message : String(error))
          });
        }
        break;

      case 'installSdk':
        try {
          console.log('[VueWebviewProvider] Starting SDK installation...');
          const { sdkSource, version, installPath, toolchainSource, toolsPath } = message.data;
          
          console.log('[VueWebviewProvider] Installation parameters:', {
            sdkSource,
            version,
            installPath,
            toolchainSource,
            toolsPath
          });

          // 首先检查 Git 是否可用
          const isGitAvailable = await gitService.isGitInstalled();
          if (!isGitAvailable) {
            throw new Error('Git 未安装或不在系统 PATH 中。请先安装 Git。');
          }
          console.log('[VueWebviewProvider] Git is available');

          // 发送安装开始消息
          webview.postMessage({
            command: 'installationStarted',
            message: '开始安装 SiFli SDK...'
          });

          // 确定仓库 URL
          const repoUrl = sdkSource === 'github' 
            ? 'https://github.com/OpenSiFli/SiFli-SDK.git'
            : 'https://gitee.com/SiFli/sifli-sdk.git';

          console.log('[VueWebviewProvider] Repository URL:', repoUrl);

          // 创建安装目录 - 修正路径结构为 installPath/SiFli-SDK/version
          const sdkBasePath = path.join(installPath, 'SiFli-SDK');
          const fullInstallPath = path.join(sdkBasePath, version.name);
          console.log('[VueWebviewProvider] SDK base path:', sdkBasePath);
          console.log('[VueWebviewProvider] Full install path:', fullInstallPath);

          // 发送日志消息
          webview.postMessage({
            command: 'installationLog',
            log: `🚀 准备安装 SiFli SDK ${version.name}`
          });

          webview.postMessage({
            command: 'installationLog',
            log: `🔗 源码仓库: ${repoUrl}`
          });

          webview.postMessage({
            command: 'installationLog',
            log: `📂 安装路径: ${fullInstallPath}`
          });

          // 确保 SiFli-SDK 基础目录存在
          if (!fs.existsSync(sdkBasePath)) {
            console.log('[VueWebviewProvider] Creating SDK base directory:', sdkBasePath);
            fs.mkdirSync(sdkBasePath, { recursive: true });
            webview.postMessage({
              command: 'installationLog',
              log: `📁 创建基础目录: ${sdkBasePath}`
            });
          }

          // 检查具体版本目录是否已存在
          if (fs.existsSync(fullInstallPath)) {
            console.log('[VueWebviewProvider] Directory already exists, will overwrite');
            webview.postMessage({
              command: 'installationLog',
              log: `⚠️  目标目录已存在，将进行覆盖安装`
            });
          }

          webview.postMessage({
            command: 'installationLog',
            log: `🔄 开始克隆仓库（包含子模块）...`
          });

          console.log('[VueWebviewProvider] Starting clone operation...');

          // 使用 GitService 克隆仓库，包含 --recursive 选项
          await gitService.cloneRepository(repoUrl, fullInstallPath, {
            branch: version.type === 'release' ? version.tagName : version.name,
            onProgress: (progress) => {
              console.log('[VueWebviewProvider] Clone progress:', progress);
              // 发送 Git 日志到前端
              webview.postMessage({
                command: 'installationLog',
                log: progress
              });
            }
          });

          console.log('[VueWebviewProvider] Clone operation completed');

          webview.postMessage({
            command: 'installationLog',
            log: '🎉 Git 克隆操作完成！'
          });

          webview.postMessage({
            command: 'installationLog',
            log: `✅ SiFli SDK ${version.name} 安装成功！`
          });

          webview.postMessage({
            command: 'installationLog',
            log: `📁 安装路径: ${fullInstallPath}`
          });

          // 发送安装成功消息
          webview.postMessage({
            command: 'installationCompleted',
            message: `SiFli SDK ${version.name} 安装成功！`,
            path: fullInstallPath
          });

          console.log('[VueWebviewProvider] SDK installation completed successfully');

        } catch (error) {
          console.error('[VueWebviewProvider] SDK installation failed:', error);
          
          // 安装失败时终止Git进程
          await this.terminateGitProcesses();
          
          // 发送错误日志
          webview.postMessage({
            command: 'installationLog',
            log: `❌ 安装失败: ${error instanceof Error ? error.message : String(error)}`
          });
          
          webview.postMessage({
            command: 'installationFailed',
            message: '安装失败: ' + (error instanceof Error ? error.message : String(error))
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
            log: '⚠️ 用户取消了安装操作'
          });
          
          webview.postMessage({
            command: 'installationFailed',
            message: '安装已取消'
          });
          
        } catch (error) {
          console.error('[VueWebviewProvider] Error cancelling installation:', error);
          webview.postMessage({
            command: 'installationLog',
            log: `❌ 取消安装时发生错误: ${error instanceof Error ? error.message : String(error)}`
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
            path: defaultPath
          });
        } catch (error) {
          console.error('[VueWebviewProvider] Error getting default install path:', error);
          // 如果获取失败，发送一个通用默认路径
          webview.postMessage({
            command: 'defaultInstallPath',
            path: '~/sifli'
          });
        }
        break;

      default:
        console.warn('[VueWebviewProvider] Unknown command:', message.command);
    }
  }
}
