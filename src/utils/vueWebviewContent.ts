import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function getVueWebviewContent(webview: vscode.Webview, extensionPath: string): string {
  const vueDistPath = path.join(extensionPath, 'webview-vue', 'dist');
  const templatePath = path.join(extensionPath, 'src', 'providers', 'templates', 'webview.html');

  const getResourceUri = (relativePath: string) => {
    const fullPath = path.join(vueDistPath, relativePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    return webview.asWebviewUri(vscode.Uri.file(fullPath)).toString();
  };

  const jsUri = getResourceUri('assets/index.js');
  const cssFiles = fs.existsSync(path.join(vueDistPath, 'assets'))
    ? fs.readdirSync(path.join(vueDistPath, 'assets')).filter(file => file.endsWith('.css'))
    : [];
  const cssUris = cssFiles.map(file => getResourceUri(`assets/${file}`)).filter(Boolean);

  if (!jsUri) {
    return getErrorWebviewContent(vscode.l10n.t('Vue application script file was not found. Run yarn build:webview.'));
  }

  if (!fs.existsSync(templatePath)) {
    return getErrorWebviewContent(vscode.l10n.t('The webview template file was not found.'));
  }

  let html = fs.readFileSync(templatePath, 'utf8');
  const cssLinks = cssUris.map(uri => `<link rel="stylesheet" href="${uri}">`).join('\n  ');
  html = html.replace('{{VUE_SCRIPT_URI}}', jsUri);
  html = html.replace('</head>', `  ${cssLinks}\n</head>`);
  return html;
}

function getErrorWebviewContent(message: string): string {
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
