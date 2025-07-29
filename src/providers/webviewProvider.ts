import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class WebviewProvider {
  private static instance: WebviewProvider;

  private constructor() {}

  public static getInstance(): WebviewProvider {
    if (!WebviewProvider.instance) {
      WebviewProvider.instance = new WebviewProvider();
    }
    return WebviewProvider.instance;
  }

  /**
   * 创建 SDK 管理 WebView
   */
  public async createSdkManagementWebview(context: vscode.ExtensionContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'sifliSdkManager',
      'SiFli SDK 管理器',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'webview-ui')),
          vscode.Uri.file(path.join(context.extensionPath, 'WebView'))
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
          console.error('[WebviewProvider] Error handling webview message:', error);
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
   * 获取 WebView HTML 内容
   */
  private getWebviewContent(webview: vscode.Webview, extensionPath: string): string {
    // 首先尝试从新的 webview-ui 目录读取
    const newWebviewPath = path.join(extensionPath, 'webview-ui', 'sdk_manager.html');
    const oldWebviewPath = path.join(extensionPath, 'WebView', 'sdk_manager.html');
    
    let htmlPath = '';
    if (fs.existsSync(newWebviewPath)) {
      htmlPath = newWebviewPath;
    } else if (fs.existsSync(oldWebviewPath)) {
      htmlPath = oldWebviewPath;
    } else {
      return this.getDefaultWebviewContent();
    }

    try {
      let html = fs.readFileSync(htmlPath, 'utf8');
      
      // 更新资源路径
      const webviewDir = path.dirname(htmlPath);
      
      // 替换 CSS 和 JS 文件路径
      html = html.replace(
        /href="([^"]*\.css)"/g,
        (match, fileName) => {
          const resourcePath = path.join(webviewDir, fileName);
          if (fs.existsSync(resourcePath)) {
            const resourceUri = webview.asWebviewUri(vscode.Uri.file(resourcePath));
            return `href="${resourceUri}"`;
          }
          return match;
        }
      );

      html = html.replace(
        /src="([^"]*\.js)"/g,
        (match, fileName) => {
          const resourcePath = path.join(webviewDir, fileName);
          if (fs.existsSync(resourcePath)) {
            const resourceUri = webview.asWebviewUri(vscode.Uri.file(resourcePath));
            return `src="${resourceUri}"`;
          }
          return match;
        }
      );

      return html;
    } catch (error) {
      console.error('[WebviewProvider] Error reading webview content:', error);
      return this.getDefaultWebviewContent();
    }
  }

  /**
   * 获取默认的 WebView 内容
   */
  private getDefaultWebviewContent(): string {
    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SiFli SDK 管理器</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
          }
          .section {
            margin-bottom: 30px;
            padding: 20px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
          }
          .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            margin: 5px;
            cursor: pointer;
            border-radius: 3px;
          }
          .button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .input-group {
            margin: 10px 0;
          }
          .input-group label {
            display: block;
            margin-bottom: 5px;
          }
          .input-group input, .input-group select {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>SiFli SDK 管理器</h1>
          
          <div class="section">
            <h2>安装新的 SDK</h2>
            <div class="input-group">
              <label for="source">仓库源:</label>
              <select id="source">
                <option value="github">GitHub</option>
                <option value="gitee">Gitee</option>
              </select>
            </div>
            <div class="input-group">
              <label for="type">类型:</label>
              <select id="type">
                <option value="tag">发布版本</option>
                <option value="branch">分支</option>
              </select>
            </div>
            <div class="input-group">
              <label for="name">名称:</label>
              <input type="text" id="name" placeholder="输入标签名或分支名">
            </div>
            <div class="input-group">
              <label for="installPath">安装路径:</label>
              <input type="text" id="installPath" placeholder="输入安装路径">
            </div>
            <button class="button" onclick="installSdk()">安装 SDK</button>
          </div>

          <div class="section">
            <h2>已安装的 SDK</h2>
            <div id="installedSdks">
              <p>正在加载...</p>
            </div>
          </div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          function installSdk() {
            const source = document.getElementById('source').value;
            const type = document.getElementById('type').value;
            const name = document.getElementById('name').value;
            const installPath = document.getElementById('installPath').value;

            if (!name.trim() || !installPath.trim()) {
              alert('请填写完整信息');
              return;
            }

            vscode.postMessage({
              command: 'installSdk',
              source,
              type,
              name: name.trim(),
              installPath: installPath.trim()
            });
          }

          // 监听来自扩展的消息
          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
              case 'updateSdkList':
                updateSdkList(message.sdks);
                break;
              case 'installationComplete':
                alert('SDK 安装完成！');
                break;
              case 'installationError':
                alert('SDK 安装失败: ' + message.error);
                break;
              case 'error':
                alert('错误: ' + message.error);
                break;
            }
          });

          function updateSdkList(sdks) {
            const container = document.getElementById('installedSdks');
            if (sdks.length === 0) {
              container.innerHTML = '<p>未发现已安装的 SDK</p>';
              return;
            }

            const html = sdks.map(sdk => 
              \`<div style="margin: 10px 0; padding: 10px; border: 1px solid var(--vscode-panel-border);">
                <strong>\${sdk.version}</strong> \${sdk.current ? '(当前)' : ''}
                <br>
                <small>\${sdk.path}</small>
                <br>
                <small>状态: \${sdk.valid ? '有效' : '无效'}</small>
              </div>\`
            ).join('');

            container.innerHTML = html;
          }

          // 页面加载时请求 SDK 列表
          vscode.postMessage({ command: 'getSdkList' });
        </script>
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
    
    const sdkCommands = SdkCommands.getInstance();
    const sdkService = SdkService.getInstance();

    switch (message.command) {
      case 'installSdk':
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

      default:
        console.warn('[WebviewProvider] Unknown command:', message.command);
    }
  }
}
