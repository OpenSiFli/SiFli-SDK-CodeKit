import * as vscode from 'vscode';
import { McpServerDefinitionProviderService } from '../services/mcpServerDefinitionProviderService';
import { LogService } from '../services/logService';
import { McpConnectionInfo, McpServerService } from '../services/mcpServerService';
import { SifliSidebarManager } from '../providers/sifliSidebarProvider';

export class McpCommands {
  private static instance: McpCommands;

  private readonly mcpServerService: McpServerService;
  private readonly mcpServerDefinitionProviderService: McpServerDefinitionProviderService;
  private readonly logService: LogService;
  private readonly sidebarManager: SifliSidebarManager;

  private constructor() {
    this.mcpServerService = McpServerService.getInstance();
    this.mcpServerDefinitionProviderService = McpServerDefinitionProviderService.getInstance();
    this.logService = LogService.getInstance();
    this.sidebarManager = SifliSidebarManager.getInstance();
  }

  public static getInstance(): McpCommands {
    if (!McpCommands.instance) {
      McpCommands.instance = new McpCommands();
    }
    return McpCommands.instance;
  }

  public async startServer(): Promise<void> {
    try {
      const info = await this.mcpServerService.start();
      if (!info.running) {
        const message = vscode.l10n.t('Enable MCP first in the sidebar or settings.');
        vscode.window.showWarningMessage(message);
        return;
      }

      this.mcpServerDefinitionProviderService.notifyDefinitionsChanged();
      this.sidebarManager.refresh();
      await this.copyConnectionInfo(info);
    } catch (error) {
      this.logService.error('Failed to start MCP server:', error);
      vscode.window.showErrorMessage(
        vscode.l10n.t('Failed to start SiFli MCP server: {0}', error instanceof Error ? error.message : String(error))
      );
    }
  }

  public async stopServer(): Promise<void> {
    await this.mcpServerService.stop();
    this.mcpServerDefinitionProviderService.notifyDefinitionsChanged();
    this.sidebarManager.refresh();
    vscode.window.showInformationMessage(vscode.l10n.t('SiFli MCP server stopped.'));
  }

  public async copyConnectionInfo(info?: McpConnectionInfo): Promise<void> {
    const settings = this.mcpServerService.getSettings();
    if (!settings.enabled) {
      vscode.window.showWarningMessage(vscode.l10n.t('Enable MCP first in the sidebar or settings.'));
      return;
    }

    const resolvedInfo = info ?? this.mcpServerService.getConnectionInfo();
    if (!resolvedInfo.running || !resolvedInfo.url || !resolvedInfo.token) {
      vscode.window.showWarningMessage(vscode.l10n.t('SiFli MCP server is not running.'));
      return;
    }

    const snippet = JSON.stringify(
      {
        codekit: {
          headers: {
            Authorization: `Bearer ${resolvedInfo.token}`,
          },
          type: 'http',
          url: resolvedInfo.url,
        },
      },
      null,
      2
    );
    await vscode.env.clipboard.writeText(snippet);
    vscode.window.showInformationMessage(vscode.l10n.t('SiFli MCP JSON configuration copied to clipboard.'));
  }

  public async toggleEnabled(): Promise<void> {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    const nextValue = !this.mcpServerService.getSettings().enabled;
    await config.update('mcp.enabled', nextValue, vscode.ConfigurationTarget.Global);
    this.sidebarManager.refresh();
    vscode.window.showInformationMessage(
      nextValue ? vscode.l10n.t('SiFli MCP enabled.') : vscode.l10n.t('SiFli MCP disabled.')
    );
  }

  public async toggleAutoStart(): Promise<void> {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    const nextValue = !this.mcpServerService.getSettings().autoStart;
    await config.update('mcp.autoStart', nextValue, vscode.ConfigurationTarget.Global);
    this.sidebarManager.refresh();
    vscode.window.showInformationMessage(
      nextValue ? vscode.l10n.t('SiFli MCP auto-start enabled.') : vscode.l10n.t('SiFli MCP auto-start disabled.')
    );
  }

  public async configureEndpoint(): Promise<void> {
    const currentSettings = this.mcpServerService.getSettings();

    const host = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('MCP host'),
      value: currentSettings.host,
      validateInput: input => (!input.trim() ? vscode.l10n.t('Host is required.') : null),
    });
    if (!host) {
      return;
    }

    const port = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('MCP port (0 means auto-assign)'),
      value: String(currentSettings.port),
      validateInput: input => {
        const parsed = Number.parseInt(input, 10);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
          return vscode.l10n.t('Port must be an integer between 0 and 65535.');
        }
        return null;
      },
    });
    if (!port) {
      return;
    }

    const fixedToken = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Fixed MCP token (leave empty to auto-generate)'),
      value: currentSettings.fixedToken ?? '',
      validateInput: input => {
        if (input.trim().length > 0 && input.trim().length < 8) {
          return vscode.l10n.t('Fixed token should be at least 8 characters long.');
        }
        return null;
      },
    });
    if (fixedToken === undefined) {
      return;
    }

    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    await config.update('mcp.host', host.trim(), vscode.ConfigurationTarget.Global);
    await config.update('mcp.port', Number.parseInt(port, 10), vscode.ConfigurationTarget.Global);
    await config.update('mcp.fixedToken', fixedToken.trim() || undefined, vscode.ConfigurationTarget.Global);
    this.sidebarManager.refresh();
  }

  public async showLogs(): Promise<void> {
    this.logService.show();
  }
}
