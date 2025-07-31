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

    // 处理来自 WebView 的消息
    panel.webview.onDidReceiveMessage(
      async (message) => {
        try {
          await this.handleWebviewMessage(message, panel.webview);
        } catch (error) {
          console.error('[VueWebviewProvider] Error handling webview message:', error);
          panel.webview.postMessage({
            command: 'error',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      },
      undefined,
      context.subscriptions
    );
  }

  /**
   * 获取 Vue WebView HTML 内容
   */
  private getWebviewContent(webview: vscode.Webview, extensionPath: string): string {
    const vueDistPath = path.join(extensionPath, 'webview-vue', 'dist');
    const templatePath = path.join(__dirname, 'templates', 'webview.html');
    
    // 获取资源 URI
    const getResourceUri = (relativePath: string) => {
      const fullPath = path.join(vueDistPath, relativePath);
      return fs.existsSync(fullPath) 
        ? webview.asWebviewUri(vscode.Uri.file(fullPath)).toString()
        : null;
    };

    const jsUri = getResourceUri('assets/index.js');

    if (!jsUri) {
      return this.getErrorWebviewContent('Vue 应用脚本文件未找到，请运行 yarn build:webview');
    }

    if (!fs.existsSync(templatePath)) {
      return this.getErrorWebviewContent('Webview 模板文件未找到');
    }

    try {
      let html = fs.readFileSync(templatePath, 'utf8');
      // 替换模板变量
      html = html.replace('{{VUE_SCRIPT_URI}}', jsUri);
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
