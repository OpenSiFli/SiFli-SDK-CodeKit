import * as http from 'http';
import * as vscode from 'vscode';
import { createHash, randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ZodRawShape } from 'zod';
import { MCP_SERVER_LABEL } from '../constants';
import { RegisteredMcpToolDefinition } from '../types';
import { LogService } from './logService';
import { ToolRegistryService } from './toolRegistryService';

type McpSettings = {
  enabled: boolean;
  autoStart: boolean;
  host: string;
  port: number;
  fixedToken?: string;
};

type McpConnectionInfo = {
  running: boolean;
  host?: string;
  port?: number;
  url?: string;
  token?: string;
};

type McpSessionEntry = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

export type { McpSettings, McpConnectionInfo };

const MCP_PATH = '/mcp';

export class McpServerService {
  private static instance: McpServerService;

  private readonly logService: LogService;
  private readonly toolRegistry: ToolRegistryService;
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private server?: http.Server;
  private readonly sessions = new Map<string, McpSessionEntry>();
  private host?: string;
  private port?: number;
  private token?: string;

  private constructor() {
    this.logService = LogService.getInstance();
    this.toolRegistry = ToolRegistryService.getInstance();
  }

  public static getInstance(): McpServerService {
    if (!McpServerService.instance) {
      McpServerService.instance = new McpServerService();
    }
    return McpServerService.instance;
  }

  public get onDidChangeState(): vscode.Event<void> {
    return this.changeEmitter.event;
  }

  public async start(force = false): Promise<McpConnectionInfo> {
    const settings = this.readSettings();
    if (!settings.enabled && !force) {
      return { running: false };
    }

    if (this.server) {
      return this.getConnectionInfo();
    }

    this.host = settings.host;
    this.port = settings.port;
    this.token = settings.fixedToken || randomUUID();
    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(settings.port, settings.host, () => {
        this.server!.off('error', reject);
        const address = this.server!.address();
        if (address && typeof address !== 'string') {
          this.host = settings.host;
          this.port = address.port;
        }
        resolve();
      });
    });

    this.logService.info(`MCP server started at ${this.getConnectionInfo().url}`);
    this.changeEmitter.fire();
    return this.getConnectionInfo();
  }

  public async stop(): Promise<void> {
    for (const [sessionId, entry] of this.sessions.entries()) {
      try {
        await entry.server.close();
      } catch (error) {
        this.logService.warn(`Failed to close MCP session ${sessionId}: ${String(error)}`);
      }
    }
    this.sessions.clear();

    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close(error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }

    this.server = undefined;
    this.host = undefined;
    this.port = undefined;
    this.token = undefined;
    this.logService.info('MCP server stopped');
    this.changeEmitter.fire();
  }

  public async syncWithConfiguration(): Promise<void> {
    const settings = this.readSettings();
    const shouldRestart =
      !!this.server &&
      (this.host !== settings.host ||
        this.port !== settings.port ||
        this.token !== (settings.fixedToken || this.token));

    if (!settings.enabled) {
      if (this.server) {
        await this.stop();
      }
      this.changeEmitter.fire();
      return;
    }

    if (shouldRestart) {
      await this.stop();
      if (settings.autoStart) {
        await this.start();
      } else {
        this.changeEmitter.fire();
      }
      return;
    }

    if (!this.server && settings.autoStart) {
      await this.start();
      return;
    }

    this.changeEmitter.fire();
  }

  public isEnabled(): boolean {
    return this.readSettings().enabled;
  }

  public getSettings(): McpSettings {
    return this.readSettings();
  }

  public getConnectionInfo(): McpConnectionInfo {
    if (!this.server || !this.host || !this.port || !this.token) {
      return { running: false };
    }

    return {
      running: true,
      host: this.host,
      port: this.port,
      url: `http://${this.host}:${this.port}${MCP_PATH}`,
      token: this.token,
    };
  }

  public notifyToolsListChanged(): void {
    for (const [sessionId, entry] of this.sessions.entries()) {
      try {
        entry.server.sendToolListChanged();
      } catch (error) {
        this.logService.warn(`Failed to notify tool list change for MCP session ${sessionId}: ${String(error)}`);
      }
    }
  }

  public createPlaceholderDefinition(): vscode.McpHttpServerDefinition {
    const settings = this.readSettings();
    const placeholderPort = settings.port > 0 ? settings.port : 0;
    const uri = vscode.Uri.parse(`http://${settings.host}:${placeholderPort}${MCP_PATH}`);
    return new vscode.McpHttpServerDefinition(MCP_SERVER_LABEL, uri, {}, this.getDefinitionVersion());
  }

  public getDefinitionVersion(): string {
    const settings = this.readSettings();
    const extensionVersion = vscode.extensions.getExtension('SiFli.sifli-sdk-codekit')?.packageJSON.version ?? '0.0.0';
    const tools = this.toolRegistry.getMcpTools().map(tool => ({
      name: tool.name,
      title: tool.title,
      inputSchema: tool.inputSchema,
    }));

    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          enabled: settings.enabled,
          host: settings.host,
          port: settings.port,
          tools,
        })
      )
      .digest('hex')
      .slice(0, 12);

    return `${extensionVersion}+${digest}`;
  }

  private readSettings(): McpSettings {
    const configuration = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    return {
      enabled: configuration.get<boolean>('mcp.enabled', true),
      autoStart: configuration.get<boolean>('mcp.autoStart', false),
      host: configuration.get<string>('mcp.host', '127.0.0.1'),
      port: configuration.get<number>('mcp.port', 0),
      fixedToken: this.normalizeFixedToken(configuration.get<string>('mcp.fixedToken', '')),
    };
  }

  private normalizeFixedToken(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private async handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const sessionId = this.getSessionId(request);
      this.logService.info(
        `MCP HTTP ${request.method ?? 'UNKNOWN'} ${url.pathname} accept=${request.headers.accept ?? 'N/A'} session=${sessionId ? 'present' : 'absent'}`
      );

      if (url.pathname !== MCP_PATH) {
        this.sendStatus(response, 404);
        return;
      }

      if (!this.isAuthorized(request)) {
        this.writeJson(response, 401, { error: 'Unauthorized' });
        return;
      }

      if (request.method === 'POST' && !sessionId) {
        const entry = await this.createSessionEntry();
        await entry.transport.handleRequest(request, response);
        const createdSessionId = entry.transport.sessionId;
        if (createdSessionId) {
          this.sessions.set(createdSessionId, entry);
          this.logService.info(`Created MCP session ${createdSessionId}`);
          this.changeEmitter.fire();
        } else {
          await entry.server.close();
        }
        return;
      }

      if (!sessionId) {
        if (request.method === 'GET') {
          this.sendStatus(response, 405, { Allow: 'POST, GET, DELETE' });
          return;
        }
        this.sendStatus(response, 400);
        return;
      }

      const entry = this.sessions.get(sessionId);
      if (!entry) {
        this.sendStatus(response, 404);
        return;
      }

      await entry.transport.handleRequest(request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logService.error('MCP request handling failed:', error);
      this.writeJson(response, 500, { error: message });
    }
  }

  private async createSessionEntry(): Promise<McpSessionEntry> {
    const server = new McpServer(
      {
        name: 'SiFli CodeKit MCP',
        version: vscode.extensions.getExtension('SiFli.sifli-sdk-codekit')?.packageJSON.version ?? '0.0.0',
      },
      {
        instructions:
          'This MCP server is hosted by the SiFli SDK CodeKit VS Code extension and executes commands inside the VS Code host.',
      }
    );

    this.registerTools(server);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    await server.connect(transport);

    const originalOnClose = transport.onclose;
    transport.onclose = () => {
      originalOnClose?.();
      const currentSessionId = transport.sessionId;
      if (currentSessionId) {
        this.sessions.delete(currentSessionId);
        this.logService.info(`Closed MCP session ${currentSessionId}`);
        this.changeEmitter.fire();
      }
    };

    const originalOnError = transport.onerror;
    transport.onerror = error => {
      originalOnError?.(error);
      this.logService.error('MCP transport error:', error);
    };

    return { server, transport };
  }

  private registerTools(server: McpServer): void {
    for (const definition of this.toolRegistry.getMcpToolDefinitions()) {
      const config: {
        title?: string;
        description?: string;
        inputSchema?: ZodRawShape;
      } = {
        title: definition.mcp.title,
        description: definition.mcp.description,
      };

      if (definition.mcp.inputShape) {
        config.inputSchema = definition.mcp.inputShape;
      }

      server.registerTool(
        definition.mcp.name,
        config as any,
        (async (args: Record<string, unknown> | undefined, extra: { sessionId?: string }) =>
          this.toMcpToolResult(
            await definition.invoke((args ?? {}) as Record<string, unknown>, {
              transport: 'mcp',
              sessionId: extra.sessionId,
            })
          )) as any
      );
    }
  }

  private toMcpToolResult(payload: unknown): {
    content: Array<{ type: 'text'; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  } {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    const result: {
      content: Array<{ type: 'text'; text: string }>;
      structuredContent?: Record<string, unknown>;
      isError?: boolean;
    } = {
      content: [{ type: 'text', text }],
    };

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      result.structuredContent = payload as Record<string, unknown>;
      if ('success' in result.structuredContent && result.structuredContent.success === false) {
        result.isError = true;
      }
    }

    return result;
  }

  private isAuthorized(request: http.IncomingMessage): boolean {
    const authorization = request.headers.authorization;
    if (!this.token || typeof authorization !== 'string') {
      return false;
    }
    return authorization === `Bearer ${this.token}`;
  }

  private getSessionId(request: http.IncomingMessage): string | undefined {
    return typeof request.headers['mcp-session-id'] === 'string' ? request.headers['mcp-session-id'] : undefined;
  }

  private writeJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
    response.writeHead(statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  }

  private sendStatus(response: http.ServerResponse, statusCode: number, headers: Record<string, string> = {}): void {
    for (const [key, value] of Object.entries(headers)) {
      response.setHeader(key, value);
    }
    response.statusCode = statusCode;
    response.end();
  }
}
