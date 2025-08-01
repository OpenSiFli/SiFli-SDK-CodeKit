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
    });
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
      case 'installSdk':
      case 'startSdkInstallation':
        await sdkCommands.installSiFliSdk(
          message.source,
          message.type,
          message.name,
          message.installPath,
          webview
        );
        break;

      case 'getSdkList':
        const sdks = await sdkService.discoverSiFliSdks();
        webview.postMessage({
          command: 'updateSdkList',
          sdks
        });
        break;

      case 'fetchReleases':
        try {
          const releases = await gitService.fetchSiFliSdkReleases(message.source);
          webview.postMessage({
            command: 'displayReleases',
            releases
          });
        } catch (error) {
          console.error('[VueWebviewProvider] Error fetching releases:', error);
          webview.postMessage({
            command: 'error',
            message: '获取版本列表失败: ' + (error instanceof Error ? error.message : String(error))
          });
        }
        break;

      case 'fetchBranches':
        try {
          const branches = await gitService.fetchSiFliSdkBranches(message.source);
          webview.postMessage({
            command: 'displayBranches',
            branches
          });
        } catch (error) {
          console.error('[VueWebviewProvider] Error fetching branches:', error);
          webview.postMessage({
            command: 'error',
            message: '获取分支列表失败: ' + (error instanceof Error ? error.message : String(error))
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

      default:
        console.warn('[VueWebviewProvider] Unknown command:', message.command);
    }
  }
}
