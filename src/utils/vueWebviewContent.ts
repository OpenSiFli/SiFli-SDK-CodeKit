import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface VueWebviewContentOptions {
  scriptFile?: string;
  cssFiles?: string[];
  title?: string;
}

export function getVueWebviewContent(
  webview: vscode.Webview,
  extensionPath: string,
  options: VueWebviewContentOptions = {}
): string {
  const vueDistPath = path.join(extensionPath, 'webview-vue', 'dist');
  const templatePath = path.join(extensionPath, 'src', 'providers', 'templates', 'webview.html');
  const scriptFile = options.scriptFile ?? 'assets/index.js';
  const title = options.title ?? 'SiFli SDK Manager';

  const getResourceUri = (relativePath: string) => {
    const fullPath = path.join(vueDistPath, relativePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    return webview.asWebviewUri(vscode.Uri.file(fullPath)).toString();
  };

  const jsUri = getResourceUri(scriptFile);
  const cssFiles =
    options.cssFiles ??
    (fs.existsSync(path.join(vueDistPath, 'assets'))
      ? fs
          .readdirSync(path.join(vueDistPath, 'assets'))
          .filter(file => file.endsWith('.css'))
          .map(file => `assets/${file}`)
      : []);
  const cssUris = cssFiles.map(file => getResourceUri(file)).filter(Boolean);

  if (!jsUri) {
    return getErrorWebviewContent(vscode.l10n.t('Vue application script file was not found. Run yarn build:webview.'));
  }

  if (!fs.existsSync(templatePath)) {
    return getErrorWebviewContent(vscode.l10n.t('The webview template file was not found.'));
  }

  let html = fs.readFileSync(templatePath, 'utf8');
  const cssLinks = cssUris.map(uri => `<link rel="stylesheet" href="${uri}">`).join('\n  ');
  html = html.replace('{{VUE_SCRIPT_URI}}', jsUri);
  html = html.replace('{{WEBVIEW_TITLE}}', title);
  html = html.replace('</head>', `  ${cssLinks}\n</head>`);
  return html;
}

function getErrorWebviewContent(message: string): string {
  const language = vscode.env.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  const title = vscode.l10n.t('Error');
  const heading = vscode.l10n.t('Failed to load');
  const hint = vscode.l10n.t('Check whether the webview-vue project has been built correctly.');

  return `
    <!DOCTYPE html>
    <html lang="${language}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
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
      <h1>${heading}</h1>
      <div class="error">${message}</div>
      <p>${hint}</p>
    </body>
    </html>
  `;
}
