import * as http from 'http';
import * as vscode from 'vscode';
import { createHash, randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ZodRawShape, ZodTypeAny } from 'zod';
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
  lastActivityAt: number;
};

type TaskStoreLike = {
  createTask(options: { ttl?: number | null; pollInterval?: number }): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<unknown>;
  getTaskResult(taskId: string): Promise<unknown>;
  storeTaskResult(taskId: string, status: 'completed' | 'failed', result: unknown): Promise<void>;
  updateTaskStatus(
    taskId: string,
    status: 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled',
    statusMessage?: string
  ): Promise<void>;
};

export type { McpSettings, McpConnectionInfo };

const MCP_PATH = '/mcp';
const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_SESSIONS = 32;
const TASK_TTL_MS = 15 * 60 * 1000;

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
  private configuredHost?: string;
  private configuredPort?: number;
  private configuredFixedToken?: string;
  private cleanupTimer?: NodeJS.Timeout;
  private startingPromise?: Promise<McpConnectionInfo>;
  private pruningPromise?: Promise<void>;

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

  public async start(): Promise<McpConnectionInfo> {
    const settings = this.readSettings();
    if (!settings.enabled) {
      return { running: false };
    }

    if (this.server) {
      return this.getConnectionInfo();
    }

    if (this.startingPromise) {
      return this.startingPromise;
    }

    this.startingPromise = this.startServer(settings).finally(() => {
      this.startingPromise = undefined;
    });

    return this.startingPromise;
  }

  public async stop(): Promise<void> {
    const pendingStart = this.startingPromise;
    if (pendingStart) {
      try {
        await pendingStart;
      } catch {
        // Ignore start failure here and continue stopping any committed state.
      }
    }

    this.stopSessionCleanupTimer();

    for (const [sessionId, entry] of Array.from(this.sessions.entries())) {
      await this.closeSessionEntry(sessionId, entry, 'server stop');
    }
    this.sessions.clear();

    if (this.server) {
      await this.closeHttpServer(this.server);
    }

    this.server = undefined;
    this.host = undefined;
    this.port = undefined;
    this.token = undefined;
    this.configuredHost = undefined;
    this.configuredPort = undefined;
    this.configuredFixedToken = undefined;
    this.logService.info('MCP server stopped');
    this.changeEmitter.fire();
  }

  public async syncWithConfiguration(): Promise<void> {
    const settings = this.readSettings();
    const isRunning = !!this.server;
    const shouldRestart =
      isRunning &&
      (this.configuredHost !== settings.host ||
        this.configuredPort !== settings.port ||
        this.configuredFixedToken !== settings.fixedToken);

    if (!settings.enabled) {
      if (isRunning || this.sessions.size > 0 || this.cleanupTimer) {
        await this.stop();
      } else {
        this.changeEmitter.fire();
      }
      return;
    }

    if (shouldRestart) {
      await this.stop();
      if (isRunning || settings.autoStart) {
        try {
          await this.start();
        } catch (error) {
          this.logService.error('Failed to restart MCP server after configuration change:', error);
          this.changeEmitter.fire();
        }
      } else {
        this.changeEmitter.fire();
      }
      return;
    }

    if (!isRunning && settings.autoStart) {
      try {
        await this.start();
      } catch (error) {
        this.logService.error('Failed to auto-start MCP server during configuration sync:', error);
        this.changeEmitter.fire();
      }
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
    const connection = this.getConnectionInfo();
    const extensionVersion = vscode.extensions.getExtension('SiFli.sifli-sdk-codekit')?.packageJSON.version ?? '0.0.0';
    const tools = this.toolRegistry.getMcpTools().map(tool => ({
      name: tool.name,
      title: tool.title,
      inputSchema: tool.inputSchema,
    }));

    const runtimeInfo = connection.running
      ? {
          running: true,
          url: connection.url,
          tokenHash: this.hashSecret(connection.token),
          configuredHost: this.configuredHost,
          configuredPort: this.configuredPort,
          configuredFixedTokenHash: this.hashSecret(this.configuredFixedToken),
        }
      : {
          running: false,
          host: settings.host,
          port: settings.port,
          fixedTokenHash: this.hashSecret(settings.fixedToken),
        };

    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          enabled: settings.enabled,
          runtimeInfo,
          tools,
        })
      )
      .digest('hex')
      .slice(0, 12);

    return `${extensionVersion}+${digest}`;
  }

  private async startServer(settings: McpSettings): Promise<McpConnectionInfo> {
    const nextToken = settings.fixedToken ?? randomUUID();
    const pendingServer = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const handleError = (error: Error): void => {
          pendingServer.off('error', handleError);
          reject(error);
        };

        pendingServer.once('error', handleError);
        pendingServer.listen(settings.port, settings.host, () => {
          pendingServer.off('error', handleError);
          const address = pendingServer.address();
          if (!address || typeof address === 'string') {
            reject(new Error('Failed to resolve MCP server address.'));
            return;
          }

          this.server = pendingServer;
          this.host = settings.host;
          this.port = address.port;
          this.token = nextToken;
          this.configuredHost = settings.host;
          this.configuredPort = settings.port;
          this.configuredFixedToken = settings.fixedToken;
          this.startSessionCleanupTimer();
          resolve();
        });
      });
    } catch (error) {
      await this.closeHttpServer(pendingServer);
      throw error;
    }

    const info = this.getConnectionInfo();
    this.logService.info(`MCP server started at ${info.url}`);
    this.changeEmitter.fire();
    return info;
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

  private hashSecret(value: string | undefined): string | undefined {
    return value ? createHash('sha256').update(value).digest('hex').slice(0, 12) : undefined;
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

      await this.pruneExpiredSessions();

      if (!sessionId) {
        if (request.method !== 'POST') {
          this.writeJson(response, 400, {
            error: 'Session is required. Start with a JSON-RPC initialize request.',
          });
          return;
        }

        const parsedBody = await this.readJsonBody(request);
        if (!this.isInitializeRequest(parsedBody)) {
          this.writeJson(response, 400, {
            error: 'The first MCP request must be a JSON-RPC initialize request.',
          });
          return;
        }

        if (this.sessions.size >= MAX_SESSIONS) {
          this.writeJson(response, 503, {
            error: 'Too many active MCP sessions. Retry after existing sessions expire.',
          });
          return;
        }

        const entry = await this.createSessionEntry();
        await entry.transport.handleRequest(request, response, parsedBody);
        const createdSessionId = entry.transport.sessionId;
        if (createdSessionId) {
          entry.lastActivityAt = Date.now();
          this.sessions.set(createdSessionId, entry);
          this.logService.info(`Created MCP session ${createdSessionId}`);
          this.changeEmitter.fire();
          return;
        }

        await entry.server.close();
        return;
      }

      const entry = this.sessions.get(sessionId);
      if (!entry) {
        this.writeJson(response, 404, { error: 'MCP session not found.' });
        return;
      }

      entry.lastActivityAt = Date.now();
      await entry.transport.handleRequest(request, response);
      entry.lastActivityAt = Date.now();
    } catch (error) {
      const statusCode = this.getHttpErrorStatus(error);
      const message = error instanceof Error ? error.message : String(error);
      this.logService.error('MCP request handling failed:', error);
      this.writeJson(response, statusCode, { error: message });
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

    const entry: McpSessionEntry = {
      server,
      transport,
      lastActivityAt: Date.now(),
    };

    const originalOnClose = transport.onclose;
    transport.onclose = () => {
      originalOnClose?.();
      const currentSessionId = transport.sessionId;
      if (currentSessionId && this.sessions.delete(currentSessionId)) {
        this.logService.info(`Closed MCP session ${currentSessionId}`);
        this.changeEmitter.fire();
      }
    };

    const originalOnError = transport.onerror;
    transport.onerror = error => {
      originalOnError?.(error);
      this.logService.error('MCP transport error:', error);
    };

    return entry;
  }

  private registerTools(server: McpServer): void {
    for (const definition of this.toolRegistry.getMcpToolDefinitions()) {
      if (definition.mcp.execution?.taskSupport) {
        this.registerTaskTool(server, definition);
        continue;
      }

      const config: {
        title?: string;
        description?: string;
        inputSchema?: ZodRawShape | ZodTypeAny;
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

  private registerTaskTool(server: McpServer, definition: RegisteredMcpToolDefinition): void {
    const config: {
      title?: string;
      description?: string;
      inputSchema?: ZodRawShape | ZodTypeAny;
      execution: {
        taskSupport: 'optional' | 'required';
      };
    } = {
      title: definition.mcp.title,
      description: definition.mcp.description,
      execution: {
        taskSupport: definition.mcp.execution?.taskSupport ?? 'required',
      },
    };

    if (definition.mcp.inputShape) {
      config.inputSchema = definition.mcp.inputShape;
    }

    server.experimental.tasks.registerToolTask(
      definition.mcp.name,
      config as any,
      {
        createTask: async (
          args: Record<string, unknown> | undefined,
          extra: { sessionId?: string; taskStore: TaskStoreLike }
        ) => {
          const task = await extra.taskStore.createTask({
            ttl: TASK_TTL_MS,
            pollInterval: 1000,
          });

          void this.executeTaskTool(
            definition,
            (args ?? {}) as Record<string, unknown>,
            extra.sessionId,
            extra.taskStore,
            task.taskId
          );
          return { task };
        },
        getTask: async (
          _args: Record<string, unknown> | undefined,
          extra: { taskId: string; taskStore: TaskStoreLike }
        ) => extra.taskStore.getTask(extra.taskId),
        getTaskResult: async (
          _args: Record<string, unknown> | undefined,
          extra: { taskId: string; taskStore: TaskStoreLike }
        ) => extra.taskStore.getTaskResult(extra.taskId) as Promise<any>,
      } as any
    );
  }

  private async executeTaskTool(
    definition: RegisteredMcpToolDefinition,
    args: Record<string, unknown>,
    sessionId: string | undefined,
    taskStore: TaskStoreLike,
    taskId: string
  ): Promise<void> {
    try {
      const payload = await definition.invoke(args, {
        transport: 'mcp',
        sessionId,
      });
      const result = this.toMcpToolResult(payload);

      if (this.requiresHostInteraction(payload)) {
        await taskStore.updateTaskStatus(
          taskId,
          'input_required',
          this.getTaskStatusMessage(payload) ?? 'Host interaction is required to continue this task.'
        );
        return;
      }

      await taskStore.storeTaskResult(taskId, result.isError ? 'failed' : 'completed', result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await taskStore.storeTaskResult(taskId, 'failed', {
        content: [{ type: 'text', text: message }],
        isError: true,
      });
    }
  }

  private requiresHostInteraction(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return false;
    }

    return (payload as Record<string, unknown>).hostInteractionRequired === true;
  }

  private getTaskStatusMessage(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return undefined;
    }

    const message = (payload as Record<string, unknown>).message;
    return typeof message === 'string' ? message : undefined;
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

  private async readJsonBody(request: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const rawBody = Buffer.concat(chunks).toString('utf8').trim();
    if (!rawBody) {
      throw new Error('Missing JSON request body.');
    }

    try {
      return JSON.parse(rawBody);
    } catch {
      const error = new Error('Invalid JSON request body.');
      (error as Error & { statusCode?: number }).statusCode = 400;
      throw error;
    }
  }

  private isInitializeRequest(body: unknown): boolean {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return false;
    }

    return (body as Record<string, unknown>).method === 'initialize';
  }

  private async pruneExpiredSessions(): Promise<void> {
    if (this.pruningPromise) {
      return this.pruningPromise;
    }

    this.pruningPromise = (async () => {
      const now = Date.now();
      for (const [sessionId, entry] of Array.from(this.sessions.entries())) {
        if (now - entry.lastActivityAt <= SESSION_IDLE_TIMEOUT_MS) {
          continue;
        }

        await this.closeSessionEntry(sessionId, entry, 'idle timeout');
      }
    })().finally(() => {
      this.pruningPromise = undefined;
    });

    return this.pruningPromise;
  }

  private async closeSessionEntry(sessionId: string, entry: McpSessionEntry, reason: string): Promise<void> {
    try {
      await entry.server.close();
    } catch (error) {
      this.logService.warn(`Failed to close MCP session ${sessionId}: ${String(error)}`);
    }

    try {
      await entry.transport.close();
    } catch (error) {
      this.logService.warn(`Failed to close MCP transport ${sessionId}: ${String(error)}`);
    }

    this.sessions.delete(sessionId);
    this.logService.info(`Closed MCP session ${sessionId} due to ${reason}`);
    this.changeEmitter.fire();
  }

  private startSessionCleanupTimer(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      void this.pruneExpiredSessions();
    }, SESSION_CLEANUP_INTERVAL_MS);

    this.cleanupTimer.unref?.();
  }

  private stopSessionCleanupTimer(): void {
    if (!this.cleanupTimer) {
      return;
    }

    clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
  }

  private async closeHttpServer(server: http.Server): Promise<void> {
    if (!server.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private getHttpErrorStatus(error: unknown): number {
    const statusCode =
      typeof error === 'object' && error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;
    return statusCode ?? 500;
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
