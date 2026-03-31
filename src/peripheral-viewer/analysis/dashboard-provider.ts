import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildAnalysisPresentation } from './presentation';
import { PeripheralAnalysisRuntime } from './runtime';
import { AnalysisFilterState, AnalysisSessionState, AnalysisViewMode } from './types';
import { PeripheralAnalysisUiState } from './ui-state';

interface AnalysisFilterMessage {
  filters?: Partial<AnalysisFilterState>;
}

interface AnalysisViewModeMessage {
  viewMode?: AnalysisViewMode;
}

export class PeripheralAnalysisDashboardProvider implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private localeChangeListener?: vscode.Disposable;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly runtime: PeripheralAnalysisRuntime,
    private readonly uiState: PeripheralAnalysisUiState
  ) {}

  public dispose(): void {
    this.localeChangeListener?.dispose();
    this.localeChangeListener = undefined;
    this.panel?.dispose();
    this.panel = undefined;
  }

  public show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.postSnapshot();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'sifliPeripheralAnalysisDashboard',
      vscode.l10n.t('Peripheral Analysis Dashboard'),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableCommandUris: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'webview-vue', 'dist')),
          vscode.Uri.file(path.join(this.context.extensionPath, 'webview-vue', 'dist', 'assets')),
        ],
      }
    );

    panel.webview.html = this.getWebviewContent(panel.webview);
    panel.webview.onDidReceiveMessage(
      async message => {
        if (message.command === 'ready') {
          panel.webview.postMessage({
            command: 'initializeLocale',
            locale: this.getVSCodeLocale(),
          });
          panel.webview.postMessage({
            command: 'navigate',
            route: '/analysis',
          });
          this.postSnapshot();
          return;
        }

        await this.handleWebviewMessage(message);
      },
      undefined,
      this.context.subscriptions
    );

    this.localeChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('locale')) {
        panel.webview.postMessage({
          command: 'localeChanged',
          locale: this.getVSCodeLocale(),
        });
      }
    });

    panel.onDidDispose(() => {
      this.localeChangeListener?.dispose();
      this.localeChangeListener = undefined;
      this.panel = undefined;
    });

    this.panel = panel;
  }

  public refresh(): void {
    this.postSnapshot();
  }

  private async handleWebviewMessage(message: { command?: string } & Record<string, unknown>): Promise<void> {
    switch (message.command) {
      case 'getAnalysisSnapshot':
        this.postSnapshot();
        return;
      case 'setAnalysisViewMode': {
        const payload = message as AnalysisViewModeMessage;
        if (payload.viewMode === 'peripheral' || payload.viewMode === 'severity') {
          await this.uiState.setViewMode(payload.viewMode);
        }
        return;
      }
      case 'updateAnalysisFilters': {
        const payload = message as AnalysisFilterMessage;
        await this.uiState.setFilters(payload.filters ?? {}, this.runtime.getActiveSessionState());
        return;
      }
      case 'resetAnalysisFilters':
        await this.uiState.resetFilters();
        return;
      case 'runPeripheralAnalysis':
        await vscode.commands.executeCommand('extension.peripheralAnalysis.runAll');
        return;
      default:
        return;
    }
  }

  private postSnapshot(): void {
    if (!this.panel) {
      return;
    }

    const snapshot = this.getSnapshot();
    this.panel.webview.postMessage({
      command: 'analysisSnapshot',
      snapshot,
    });
  }

  private getSnapshot() {
    const sessionState = this.runtime.getActiveSessionState();
    return buildAnalysisPresentation(sessionState, this.uiState.getViewMode(), this.uiState.getFilters(sessionState));
  }

  private getVSCodeLocale(): string {
    const config = vscode.workspace.getConfiguration();
    const locale = config.get<string>('locale') || vscode.env.language || 'en';
    return locale.startsWith('zh') ? 'zh' : 'en';
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const vueDistPath = path.join(this.context.extensionPath, 'webview-vue', 'dist');
    const templatePath = path.join(this.context.extensionPath, 'src', 'providers', 'templates', 'webview.html');

    const getResourceUri = (relativePath: string): string | null => {
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
    const cssUris = cssFiles.map(file => getResourceUri(`assets/${file}`)).filter((uri): uri is string => !!uri);

    if (!jsUri) {
      return this.getErrorWebviewContent('Vue 应用脚本文件未找到，请运行 yarn build:webview');
    }

    if (!fs.existsSync(templatePath)) {
      return this.getErrorWebviewContent('Webview 模板文件未找到');
    }

    let html = fs.readFileSync(templatePath, 'utf8');
    const cssLinks = cssUris.map(uri => `<link rel="stylesheet" href="${uri}">`).join('\n  ');
    html = html.replace('{{VUE_SCRIPT_URI}}', jsUri);
    html = html.replace('</head>', `  ${cssLinks}\n</head>`);
    return html.replace(
      '<title>SiFli SDK 管理器</title>',
      `<title>${vscode.l10n.t('Peripheral Analysis Dashboard')}</title>`
    );
  }

  private getErrorWebviewContent(message: string): string {
    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>错误</title>
      </head>
      <body>
        <div style="padding: 24px; font-family: sans-serif;">${message}</div>
      </body>
      </html>
    `;
  }
}
