import * as vscode from 'vscode';
import type { ZodRawShape } from 'zod';

export type JsonSchema = Record<string, unknown>;

export type ToolTransport = 'lm' | 'mcp';

export interface ToolExecutionContext {
  transport: ToolTransport;
  sessionId?: string;
  token?: vscode.CancellationToken;
}

export interface LanguageModelToolMetadata<T extends object> {
  name: string;
  confirmationTitle?: string | ((input: T) => string);
  confirmationMessage?: string | ((input: T) => string | vscode.MarkdownString);
  invocationMessage?: string | ((input: T) => string | vscode.MarkdownString);
}

export interface McpToolMetadata {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  inputShape?: ZodRawShape;
}

export interface ToolDefinition<T extends object = Record<string, unknown>> {
  id: string;
  invoke: (input: T, context: ToolExecutionContext) => Promise<unknown>;
  lm?: LanguageModelToolMetadata<T>;
  mcp?: McpToolMetadata;
}

export interface ListedMcpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface RegisteredMcpToolDefinition extends ToolDefinition<Record<string, unknown>> {
  mcp: McpToolMetadata;
}
