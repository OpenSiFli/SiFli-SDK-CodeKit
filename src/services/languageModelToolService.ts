import * as vscode from 'vscode';
import { ToolDefinition } from '../types';
import { ToolRegistryService } from './toolRegistryService';

type EmptyInput = Record<string, never>;

export class LanguageModelToolService {
  private static instance: LanguageModelToolService;
  private readonly toolRegistry: ToolRegistryService;

  private constructor() {
    this.toolRegistry = ToolRegistryService.getInstance();
  }

  public static getInstance(): LanguageModelToolService {
    if (!LanguageModelToolService.instance) {
      LanguageModelToolService.instance = new LanguageModelToolService();
    }
    return LanguageModelToolService.instance;
  }

  public register(context: vscode.ExtensionContext): void {
    for (const descriptor of this.toolRegistry.getLanguageModelTools()) {
      this.registerTool(context, descriptor);
    }
  }

  private registerTool(context: vscode.ExtensionContext, descriptor: ToolDefinition<Record<string, unknown>>): void {
    const lmMetadata = descriptor.lm;
    if (!lmMetadata) {
      return;
    }

    const tool: vscode.LanguageModelTool<EmptyInput> = {
      prepareInvocation: async options => {
        if (!lmMetadata.confirmationTitle && !lmMetadata.confirmationMessage && !lmMetadata.invocationMessage) {
          return undefined;
        }
        return {
          invocationMessage: this.resolveMessage(lmMetadata.invocationMessage, options.input),
          confirmationMessages:
            lmMetadata.confirmationTitle || lmMetadata.confirmationMessage
              ? {
                  title: this.resolveTitle(lmMetadata.confirmationTitle, options.input) ?? lmMetadata.name,
                  message: this.resolveMessage(lmMetadata.confirmationMessage, options.input) ?? lmMetadata.name,
                }
              : undefined,
        };
      },
      invoke: async (options, token) => {
        const payload = await descriptor.invoke(options.input as Record<string, unknown>, {
          transport: 'lm',
          token,
        });
        return this.toToolResult(payload);
      },
    };

    context.subscriptions.push(vscode.lm.registerTool(lmMetadata.name, tool));
  }

  private resolveMessage<T extends object>(
    value: string | vscode.MarkdownString | ((input: T) => string | vscode.MarkdownString) | undefined,
    input: T
  ): string | vscode.MarkdownString | undefined {
    if (!value) {
      return undefined;
    }
    return typeof value === 'function' ? value(input) : value;
  }

  private resolveTitle<T extends object>(
    value: string | ((input: T) => string) | undefined,
    input: T
  ): string | undefined {
    if (!value) {
      return undefined;
    }
    return typeof value === 'function' ? value(input) : value;
  }

  private toToolResult(payload: unknown): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))]);
  }
}
