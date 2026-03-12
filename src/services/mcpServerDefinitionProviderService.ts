import * as vscode from 'vscode';
import { MCP_SERVER_DEFINITION_PROVIDER_ID } from '../constants';
import { LogService } from './logService';
import { McpServerService } from './mcpServerService';

export class McpServerDefinitionProviderService
  implements vscode.McpServerDefinitionProvider<vscode.McpHttpServerDefinition>
{
  private static instance: McpServerDefinitionProviderService;

  private readonly logService: LogService;
  private readonly mcpServerService: McpServerService;
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  private constructor() {
    this.logService = LogService.getInstance();
    this.mcpServerService = McpServerService.getInstance();
  }

  public static getInstance(): McpServerDefinitionProviderService {
    if (!McpServerDefinitionProviderService.instance) {
      McpServerDefinitionProviderService.instance = new McpServerDefinitionProviderService();
    }
    return McpServerDefinitionProviderService.instance;
  }

  public get onDidChangeMcpServerDefinitions(): vscode.Event<void> {
    return this.changeEmitter.event;
  }

  public register(context: vscode.ExtensionContext): void {
    this.logService.info(`Registering MCP server definition provider: ${MCP_SERVER_DEFINITION_PROVIDER_ID}`);
    context.subscriptions.push(this.changeEmitter);
    context.subscriptions.push(vscode.lm.registerMcpServerDefinitionProvider(MCP_SERVER_DEFINITION_PROVIDER_ID, this));
  }

  public notifyDefinitionsChanged(): void {
    this.logService.info('MCP server definitions changed');
    this.changeEmitter.fire();
  }

  public provideMcpServerDefinitions(): vscode.ProviderResult<vscode.McpHttpServerDefinition[]> {
    this.logService.info('VS Code requested MCP server definitions');
    if (!this.mcpServerService.isEnabled()) {
      this.logService.info('MCP server definition provider returned no servers because MCP is disabled');
      return [];
    }

    const definition = this.mcpServerService.createPlaceholderDefinition();
    this.logService.info(`Providing MCP server definition: ${definition.label}`);
    return [definition];
  }

  public async resolveMcpServerDefinition(
    server: vscode.McpHttpServerDefinition
  ): Promise<vscode.McpHttpServerDefinition | undefined> {
    this.logService.info(`Resolving MCP server definition: ${server.label}`);
    const connection = await this.mcpServerService.start(true);
    if (!connection.running || !connection.url || !connection.token) {
      const message = 'SiFli MCP server is unavailable.';
      this.logService.warn(message);
      throw new Error(message);
    }

    server.uri = vscode.Uri.parse(connection.url);
    server.headers = {
      Authorization: `Bearer ${connection.token}`,
    };
    server.version = this.mcpServerService.getDefinitionVersion();
    this.logService.info(`Resolved MCP server definition to ${connection.url}`);
    return server;
  }
}
