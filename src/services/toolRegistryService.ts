import * as vscode from 'vscode';
import { z } from 'zod';
import { LM_TOOL_NAMES } from '../constants';
import { JsonSchema, ListedMcpTool, RegisteredMcpToolDefinition, ToolDefinition, ToolExecutionContext } from '../types';
import { AutomationService } from './automationService';

type ToolSet = ToolDefinition<Record<string, unknown>>;

const EMPTY_OBJECT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

export class ToolRegistryService {
  private static instance: ToolRegistryService;

  private readonly automationService: AutomationService;
  private readonly tools: ToolSet[];

  private constructor() {
    this.automationService = AutomationService.getInstance();
    this.tools = this.createToolDefinitions();
  }

  public static getInstance(): ToolRegistryService {
    if (!ToolRegistryService.instance) {
      ToolRegistryService.instance = new ToolRegistryService();
    }
    return ToolRegistryService.instance;
  }

  public getLanguageModelTools(): ToolSet[] {
    return this.tools.filter(tool => !!tool.lm);
  }

  public getMcpToolDefinitions(): RegisteredMcpToolDefinition[] {
    return this.tools
      .filter((tool): tool is RegisteredMcpToolDefinition => !!tool.mcp)
      .map(tool => ({
        ...tool,
        mcp: {
          ...tool.mcp,
          inputShape: tool.mcp.inputShape ?? this.resolveMcpInputShape(tool.mcp.inputSchema),
        },
      }));
  }

  public getMcpTools(): ListedMcpTool[] {
    return this.getMcpToolDefinitions().map(tool => ({
      name: tool.mcp!.name,
      title: tool.mcp!.title,
      description: tool.mcp!.description,
      inputSchema: tool.mcp!.inputSchema,
    }));
  }

  public async invokeLanguageModelTool(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<unknown> {
    const definition = this.tools.find(tool => tool.lm?.name === name);
    if (!definition) {
      throw new Error(`Unknown language model tool: ${name}`);
    }
    return definition.invoke(input, context);
  }

  public async invokeMcpTool(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<unknown> {
    const definition = this.getMcpToolDefinitions().find(tool => tool.mcp.name === name);
    if (definition) {
      return definition.invoke(input, context);
    }

    throw new Error(`Unknown MCP tool: ${name}`);
  }

  private createToolDefinitions(): ToolSet[] {
    return [
      {
        id: 'project.getState',
        lm: {
          name: LM_TOOL_NAMES.GET_PROJECT_STATE,
        },
        mcp: {
          name: 'sifli.project.getState',
          description: 'Return the current SiFli project, SDK, board, serial port, monitor, and workflow state.',
          inputSchema: EMPTY_OBJECT_SCHEMA,
        },
        invoke: async () => this.automationService.getProjectStatePayload(),
      },
      {
        id: 'workflow.list',
        lm: {
          name: LM_TOOL_NAMES.LIST_WORKFLOWS,
        },
        mcp: {
          name: 'sifli.workflow.list',
          description: 'List workflows from workspace settings, user settings, or both.',
          inputSchema: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                enum: ['workspace', 'user', 'all'],
              },
            },
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.listWorkflows({
            scope: this.asScopeFilter(input.scope),
          }),
      },
      {
        id: 'workflow.get',
        mcp: {
          name: 'sifli.workflow.get',
          description: 'Return a single workflow definition and its runtime compatibility details.',
          inputSchema: {
            type: 'object',
            properties: {
              workflowRef: {
                type: 'string',
                description: 'Workflow reference in the form "workspace:id" or "user:id".',
              },
            },
            required: ['workflowRef'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.getWorkflow({
            workflowRef: this.asString(input.workflowRef),
          }),
      },
      {
        id: 'workflow.validate',
        mcp: {
          name: 'sifli.workflow.validate',
          description: 'Validate the current workflow configuration or a provided workflow payload.',
          inputSchema: {
            type: 'object',
            properties: {
              workflow: {
                type: 'object',
                description: 'Optional workflow payload to validate.',
              },
            },
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.validateWorkflows({
            workflow: this.asWorkflowDefinition(input.workflow),
          }),
      },
      {
        id: 'workflow.run',
        lm: {
          name: LM_TOOL_NAMES.RUN_WORKFLOW,
          invocationMessage: input => vscode.l10n.t('Running workflow {0}', this.asString(input.workflowRef)),
          confirmationTitle: input => vscode.l10n.t('Run workflow {0}?', this.asString(input.workflowRef)),
          confirmationMessage: input =>
            vscode.l10n.t('Run workflow {0} with language model tools.', this.asString(input.workflowRef)),
        },
        mcp: {
          name: 'sifli.workflow.run',
          description: 'Run a workflow by reference with optional input values.',
          inputSchema: {
            type: 'object',
            properties: {
              workflowRef: {
                type: 'string',
              },
              inputs: {
                type: 'object',
                additionalProperties: {
                  type: 'string',
                },
              },
            },
            required: ['workflowRef'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.runWorkflow({
            workflowRef: this.asString(input.workflowRef),
            inputs: this.asStringMap(input.inputs),
          }),
      },
      {
        id: 'workflow.create',
        mcp: {
          name: 'sifli.workflow.create',
          description: 'Create a workflow in workspace or user settings.',
          inputSchema: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                enum: ['workspace', 'user'],
              },
              workflow: {
                type: 'object',
              },
            },
            required: ['scope', 'workflow'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.createWorkflow({
            scope: this.asWorkflowScope(input.scope),
            workflow: this.asWorkflowDefinition(input.workflow),
          }),
      },
      {
        id: 'workflow.update',
        mcp: {
          name: 'sifli.workflow.update',
          description: 'Update an existing workflow by workflowRef.',
          inputSchema: {
            type: 'object',
            properties: {
              workflowRef: {
                type: 'string',
              },
              workflow: {
                type: 'object',
              },
            },
            required: ['workflowRef', 'workflow'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.updateWorkflow({
            workflowRef: this.asString(input.workflowRef),
            workflow: this.asWorkflowDefinition(input.workflow),
          }),
      },
      {
        id: 'workflow.delete',
        mcp: {
          name: 'sifli.workflow.delete',
          description: 'Delete a workflow by workflowRef.',
          inputSchema: {
            type: 'object',
            properties: {
              workflowRef: {
                type: 'string',
              },
            },
            required: ['workflowRef'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.deleteWorkflow({
            workflowRef: this.asString(input.workflowRef),
          }),
      },
      {
        id: 'workflow.saveStatusBarButton',
        mcp: {
          name: 'sifli.workflow.saveStatusBarButton',
          description: 'Create or update a workflow status bar button configuration.',
          inputSchema: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                enum: ['workspace', 'user'],
              },
              button: {
                type: 'object',
              },
            },
            required: ['scope', 'button'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.saveStatusBarButton({
            scope: this.asWorkflowScope(input.scope),
            button: this.asStatusBarButton(input.button),
          }),
      },
      {
        id: 'workflow.deleteStatusBarButton',
        mcp: {
          name: 'sifli.workflow.deleteStatusBarButton',
          description: 'Delete a workflow status bar button configuration.',
          inputSchema: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                enum: ['workspace', 'user'],
              },
              buttonId: {
                type: 'string',
              },
            },
            required: ['scope', 'buttonId'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.deleteStatusBarButton({
            scope: this.asWorkflowScope(input.scope),
            buttonId: this.asString(input.buttonId),
          }),
      },
      {
        id: 'workflow.approveShellStep',
        mcp: {
          name: 'sifli.workflow.approveShellStep',
          description: 'Approve a shell.command workflow step for non-interactive execution.',
          inputSchema: {
            type: 'object',
            properties: {
              workflowRef: {
                type: 'string',
              },
              stepIndex: {
                type: 'integer',
              },
              commandTemplate: {
                type: 'string',
              },
            },
            required: ['workflowRef', 'stepIndex', 'commandTemplate'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.approveWorkflowShellStep({
            workflowRef: this.asString(input.workflowRef),
            stepIndex: this.asNumber(input.stepIndex),
            commandTemplate: this.asString(input.commandTemplate),
          }),
      },
      {
        id: 'board.list',
        lm: {
          name: LM_TOOL_NAMES.LIST_BOARDS,
        },
        mcp: {
          name: 'sifli.board.list',
          description: 'List boards discovered from the SDK, custom board path, and project-local boards.',
          inputSchema: EMPTY_OBJECT_SCHEMA,
        },
        invoke: async () => this.automationService.listBoards(),
      },
      {
        id: 'board.select',
        lm: {
          name: LM_TOOL_NAMES.SELECT_BOARD,
          invocationMessage: input => vscode.l10n.t('Selecting board {0}', this.asString(input.boardName)),
          confirmationTitle: input => vscode.l10n.t('Select board {0}?', this.asString(input.boardName)),
          confirmationMessage: input =>
            vscode.l10n.t('Set the active SiFli board to {0}.', this.asString(input.boardName)),
        },
        mcp: {
          name: 'sifli.board.select',
          description: 'Select the active SiFli board and optionally update build thread count.',
          inputSchema: {
            type: 'object',
            properties: {
              boardName: {
                type: 'string',
              },
              numThreads: {
                type: 'integer',
              },
            },
            required: ['boardName'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.selectBoard({
            boardName: this.asString(input.boardName),
            numThreads: this.asOptionalNumber(input.numThreads),
          }),
      },
      {
        id: 'serial.listPorts',
        lm: {
          name: LM_TOOL_NAMES.LIST_SERIAL_PORTS,
        },
        mcp: {
          name: 'sifli.serial.listPorts',
          description: 'List serial ports and current baud rate selections.',
          inputSchema: EMPTY_OBJECT_SCHEMA,
        },
        invoke: async () => this.automationService.listSerialPorts(),
      },
      {
        id: 'serial.selectPort',
        lm: {
          name: LM_TOOL_NAMES.SELECT_SERIAL_PORT,
          invocationMessage: input => vscode.l10n.t('Selecting serial port {0}', this.asString(input.port)),
          confirmationTitle: input => vscode.l10n.t('Select serial port {0}?', this.asString(input.port)),
          confirmationMessage: input => vscode.l10n.t('Set the active serial port to {0}.', this.asString(input.port)),
        },
        mcp: {
          name: 'sifli.serial.selectPort',
          description: 'Select the active serial port and update download or monitor baud rates.',
          inputSchema: {
            type: 'object',
            properties: {
              port: {
                type: 'string',
              },
              downloadBaud: {
                type: 'integer',
              },
              monitorBaud: {
                type: 'integer',
              },
            },
            required: ['port'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.selectSerialPort({
            port: this.asString(input.port),
            downloadBaud: this.asOptionalNumber(input.downloadBaud),
            monitorBaud: this.asOptionalNumber(input.monitorBaud),
          }),
      },
      {
        id: 'monitor.open',
        lm: {
          name: LM_TOOL_NAMES.OPEN_MONITOR,
          invocationMessage: vscode.l10n.t('Opening device monitor'),
          confirmationTitle: vscode.l10n.t('Open device monitor?'),
          confirmationMessage: vscode.l10n.t('Open the serial monitor for the selected device.'),
        },
        mcp: {
          name: 'sifli.monitor.open',
          description: 'Open the serial monitor for the selected device or an explicitly provided port.',
          inputSchema: {
            type: 'object',
            properties: {
              port: {
                type: 'string',
              },
              monitorBaud: {
                type: 'integer',
              },
            },
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.openMonitor({
            port: this.asOptionalString(input.port),
            monitorBaud: this.asOptionalNumber(input.monitorBaud),
          }),
      },
      {
        id: 'monitor.close',
        lm: {
          name: LM_TOOL_NAMES.CLOSE_MONITOR,
          invocationMessage: vscode.l10n.t('Closing device monitor'),
          confirmationTitle: vscode.l10n.t('Close device monitor?'),
          confirmationMessage: vscode.l10n.t('Close the active serial monitor session.'),
        },
        mcp: {
          name: 'sifli.monitor.close',
          description: 'Close the active serial monitor session.',
          inputSchema: EMPTY_OBJECT_SCHEMA,
        },
        invoke: async () => this.automationService.closeMonitor(),
      },
      {
        id: 'build.compile',
        lm: {
          name: LM_TOOL_NAMES.COMPILE,
          invocationMessage: vscode.l10n.t('Running SiFli build'),
          confirmationTitle: vscode.l10n.t('Run SiFli build?'),
          confirmationMessage: vscode.l10n.t('Compile the current SiFli project in the integrated terminal.'),
        },
        mcp: {
          name: 'sifli.build.compile',
          description: 'Compile the current SiFli project in the VS Code terminal.',
          inputSchema: EMPTY_OBJECT_SCHEMA,
        },
        invoke: async () => this.automationService.compile(),
      },
      {
        id: 'build.rebuild',
        lm: {
          name: LM_TOOL_NAMES.REBUILD,
          invocationMessage: vscode.l10n.t('Running SiFli rebuild'),
          confirmationTitle: vscode.l10n.t('Run SiFli rebuild?'),
          confirmationMessage: vscode.l10n.t('Clean and compile the current SiFli project.'),
        },
        mcp: {
          name: 'sifli.build.rebuild',
          description: 'Clean and compile the current SiFli project in the VS Code terminal.',
          inputSchema: EMPTY_OBJECT_SCHEMA,
        },
        invoke: async () => this.automationService.rebuild(),
      },
      {
        id: 'build.clean',
        lm: {
          name: LM_TOOL_NAMES.CLEAN,
          invocationMessage: vscode.l10n.t('Cleaning SiFli build output'),
          confirmationTitle: vscode.l10n.t('Clean SiFli build output?'),
          confirmationMessage: vscode.l10n.t('Delete the current SiFli build output folder.'),
        },
        mcp: {
          name: 'sifli.build.clean',
          description: 'Delete the current SiFli build output folder.',
          inputSchema: EMPTY_OBJECT_SCHEMA,
        },
        invoke: async () => this.automationService.clean(),
      },
      {
        id: 'build.download',
        lm: {
          name: LM_TOOL_NAMES.DOWNLOAD,
          invocationMessage: vscode.l10n.t('Downloading to device'),
          confirmationTitle: vscode.l10n.t('Download to device?'),
          confirmationMessage: vscode.l10n.t('Flash the current build to the selected serial device.'),
        },
        mcp: {
          name: 'sifli.build.download',
          description: 'Flash the current build to the selected serial device.',
          inputSchema: EMPTY_OBJECT_SCHEMA,
        },
        invoke: async () => this.automationService.download(),
      },
      {
        id: 'build.menuconfig',
        mcp: {
          name: 'sifli.build.menuconfig',
          description: 'Open menuconfig in the VS Code terminal for the current board.',
          inputSchema: EMPTY_OBJECT_SCHEMA,
        },
        invoke: async () => this.automationService.menuconfig(),
      },
      {
        id: 'sdk.list',
        mcp: {
          name: 'sifli.sdk.list',
          description: 'List configured SiFli SDKs and the currently active SDK.',
          inputSchema: EMPTY_OBJECT_SCHEMA,
        },
        invoke: async () => this.automationService.listSdks(),
      },
      {
        id: 'sdk.addPath',
        mcp: {
          name: 'sifli.sdk.addPath',
          description: 'Add an SDK path, optionally set a tools path, and optionally activate it.',
          inputSchema: {
            type: 'object',
            properties: {
              sdkPath: {
                type: 'string',
              },
              toolsPath: {
                type: 'string',
              },
              activate: {
                type: 'boolean',
              },
            },
            required: ['sdkPath'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.addSdkPath({
            sdkPath: this.asString(input.sdkPath),
            toolsPath: this.asOptionalString(input.toolsPath),
            activate: this.asBoolean(input.activate),
          }),
      },
      {
        id: 'sdk.removePath',
        mcp: {
          name: 'sifli.sdk.removePath',
          description: 'Remove an SDK path from the configured SDK list.',
          inputSchema: {
            type: 'object',
            properties: {
              sdkPath: {
                type: 'string',
              },
            },
            required: ['sdkPath'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.removeSdkPath({
            sdkPath: this.asString(input.sdkPath),
          }),
      },
      {
        id: 'sdk.activate',
        mcp: {
          name: 'sifli.sdk.activate',
          description: 'Activate an SDK by path or version.',
          inputSchema: {
            type: 'object',
            properties: {
              sdkPath: {
                type: 'string',
              },
              version: {
                type: 'string',
              },
            },
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.activateSdk({
            sdkPath: this.asOptionalString(input.sdkPath),
            version: this.asOptionalString(input.version),
          }),
      },
      {
        id: 'sdk.setToolsPath',
        mcp: {
          name: 'sifli.sdk.setToolsPath',
          description: 'Set the toolchain path for a configured SDK.',
          inputSchema: {
            type: 'object',
            properties: {
              sdkPath: {
                type: 'string',
              },
              toolsPath: {
                type: 'string',
              },
            },
            required: ['sdkPath', 'toolsPath'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.setSdkToolsPath({
            sdkPath: this.asString(input.sdkPath),
            toolsPath: this.asString(input.toolsPath),
          }),
      },
      {
        id: 'sdk.fetchReleases',
        mcp: {
          name: 'sifli.sdk.fetchReleases',
          description: 'Fetch SiFli SDK releases from GitHub or Gitee.',
          inputSchema: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                enum: ['github', 'gitee'],
              },
            },
            required: ['source'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.fetchSdkReleases({
            source: this.asSource(input.source),
          }),
      },
      {
        id: 'sdk.fetchBranches',
        mcp: {
          name: 'sifli.sdk.fetchBranches',
          description: 'Fetch SiFli SDK branches from GitHub or Gitee.',
          inputSchema: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                enum: ['github', 'gitee'],
              },
            },
            required: ['source'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.fetchSdkBranches({
            source: this.asSource(input.source),
          }),
      },
      {
        id: 'project.listTemplates',
        mcp: {
          name: 'sifli.project.listTemplates',
          description: 'List creatable SiFli project templates from the selected SDK example tree.',
          inputSchema: {
            type: 'object',
            properties: {
              sdkPath: {
                type: 'string',
              },
              sdkVersion: {
                type: 'string',
              },
            },
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.listProjectTemplates({
            sdkPath: this.asOptionalString(input.sdkPath),
            sdkVersion: this.asOptionalString(input.sdkVersion),
          }),
      },
      {
        id: 'project.createFromExample',
        mcp: {
          name: 'sifli.project.createFromExample',
          description: 'Create a new project from an SDK example template.',
          inputSchema: {
            type: 'object',
            properties: {
              sdkPath: {
                type: 'string',
              },
              sdkVersion: {
                type: 'string',
              },
              templatePath: {
                type: 'string',
              },
              relativeExamplePath: {
                type: 'string',
              },
              targetPath: {
                type: 'string',
              },
              initializeGit: {
                type: 'boolean',
              },
            },
            required: ['targetPath'],
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.createProjectFromExample({
            sdkPath: this.asOptionalString(input.sdkPath),
            sdkVersion: this.asOptionalString(input.sdkVersion),
            templatePath: this.asOptionalString(input.templatePath),
            relativeExamplePath: this.asOptionalString(input.relativeExamplePath),
            targetPath: this.asString(input.targetPath),
            initializeGit: this.asBoolean(input.initializeGit),
          }),
      },
      {
        id: 'project.configureClangd',
        mcp: {
          name: 'sifli.project.configureClangd',
          description: 'Write .vscode/settings.json with the compile-commands-dir for the active board.',
          inputSchema: {
            type: 'object',
            properties: {
              boardName: {
                type: 'string',
              },
            },
            additionalProperties: false,
          },
        },
        invoke: async input =>
          this.automationService.configureClangd({
            boardName: this.asOptionalString(input.boardName),
          }),
      },
    ];
  }

  private resolveMcpInputShape(schema: JsonSchema): z.ZodRawShape | undefined {
    const jsonSchema = schema as Record<string, unknown>;
    if (jsonSchema.type !== 'object') {
      return undefined;
    }

    const properties = this.asRecord(jsonSchema.properties);
    if (!properties) {
      return undefined;
    }

    const requiredKeys = new Set(
      Array.isArray(jsonSchema.required)
        ? jsonSchema.required.filter((item): item is string => typeof item === 'string')
        : []
    );

    const shape: z.ZodRawShape = {};
    for (const [key, value] of Object.entries(properties)) {
      const field = this.toZodSchema(value as JsonSchema);
      shape[key] = requiredKeys.has(key) ? field : field.optional();
    }

    return Object.keys(shape).length > 0 ? shape : undefined;
  }

  private toZodSchema(schema: JsonSchema): z.ZodTypeAny {
    const jsonSchema = schema as Record<string, unknown>;
    const enumValues = Array.isArray(jsonSchema.enum) ? jsonSchema.enum.filter(item => typeof item === 'string') : [];
    if (enumValues.length > 0) {
      return this.createEnumSchema(enumValues);
    }

    const schemaType = jsonSchema.type;
    if (Array.isArray(schemaType)) {
      return this.createUnionSchema(
        schemaType
          .filter((item): item is string => typeof item === 'string')
          .map(typeName => this.toZodSchema({ ...jsonSchema, type: typeName, enum: undefined }))
      );
    }

    switch (schemaType) {
      case 'string':
        return z.string();
      case 'integer':
        return z.number().int();
      case 'number':
        return z.number();
      case 'boolean':
        return z.boolean();
      case 'array':
        return z.array(this.toZodSchema((jsonSchema.items as JsonSchema | undefined) ?? {}));
      case 'object': {
        const nestedProperties = this.asRecord(jsonSchema.properties);
        if (nestedProperties) {
          const nestedRequired = new Set(
            Array.isArray(jsonSchema.required)
              ? jsonSchema.required.filter((item): item is string => typeof item === 'string')
              : []
          );
          const nestedShape: z.ZodRawShape = {};
          for (const [key, value] of Object.entries(nestedProperties)) {
            const field = this.toZodSchema(value as JsonSchema);
            nestedShape[key] = nestedRequired.has(key) ? field : field.optional();
          }

          let objectSchema: z.ZodTypeAny = z.object(nestedShape);
          if (jsonSchema.additionalProperties === false) {
            objectSchema = z.object(nestedShape).strict();
          }
          return objectSchema;
        }

        if (jsonSchema.additionalProperties && typeof jsonSchema.additionalProperties === 'object') {
          return z.record(this.toZodSchema(jsonSchema.additionalProperties as JsonSchema));
        }

        return jsonSchema.additionalProperties === false ? z.object({}).strict() : z.record(z.unknown());
      }
      default:
        return z.unknown();
    }
  }

  private createEnumSchema(values: string[]): z.ZodTypeAny {
    if (values.length === 1) {
      return z.literal(values[0]);
    }

    return z.union(
      values.map(value => z.literal(value)) as [z.ZodLiteral<string>, z.ZodLiteral<string>, ...z.ZodLiteral<string>[]]
    );
  }

  private createUnionSchema(schemas: z.ZodTypeAny[]): z.ZodTypeAny {
    if (schemas.length === 0) {
      return z.unknown();
    }
    if (schemas.length === 1) {
      return schemas[0];
    }
    return z.union(schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private asBoolean(value: unknown): boolean {
    return value === true;
  }

  private asNumber(value: unknown): number {
    return typeof value === 'number' ? value : Number(value);
  }

  private asOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = this.asNumber(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private asStringMap(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const entries = Object.entries(value as Record<string, unknown>).map(([key, itemValue]) => [
      key,
      String(itemValue),
    ]);
    return Object.fromEntries(entries);
  }

  private asWorkflowScope(value: unknown): 'workspace' | 'user' {
    return value === 'user' ? 'user' : 'workspace';
  }

  private asScopeFilter(value: unknown): 'workspace' | 'user' | 'all' {
    return value === 'workspace' || value === 'user' ? value : 'all';
  }

  private asSource(value: unknown): 'github' | 'gitee' {
    return value === 'gitee' ? 'gitee' : 'github';
  }

  private asWorkflowDefinition(value: unknown): any {
    return (value ?? {}) as any;
  }

  private asStatusBarButton(value: unknown): any {
    return (value ?? {}) as any;
  }
}
