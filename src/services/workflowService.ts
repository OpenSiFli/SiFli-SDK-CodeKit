import * as vscode from 'vscode';
import { TASK_NAMES } from '../constants';
import {
  WorkflowDefinition,
  WorkflowInputSpec,
  WorkflowReference,
  WorkflowScope,
  WorkflowStatusBarButton,
  WorkflowValidationIssue,
  WorkflowStep,
  WorkflowStepType
} from '../types';
import { ConfigService } from './configService';
import { LogService } from './logService';
import { SerialMonitorService } from './serialMonitorService';
import { SerialPortService } from './serialPortService';
import { TerminalService } from './terminalService';
import { WorkspaceStateService } from './workspaceStateService';
import { getWorkflowStepDisplayLabel } from '../utils/workflowStepLabel';
import { BuildExecutionService } from './buildExecutionService';

export type ScopedWorkflowDefinition = {
  scope: WorkflowScope;
  workflow: WorkflowDefinition;
  workflowRef: WorkflowReference;
};

export type WorkflowToolCompatibility = {
  runnable: boolean;
  reasons: string[];
  hasShellCommand: boolean;
};

export type WorkflowExecutionResult = {
  success: boolean;
  workflowId?: string;
  workflowName?: string;
  workflowScope?: WorkflowScope;
  workflowRef?: WorkflowReference;
  dryRun: boolean;
  runId?: string;
  message?: string;
  exitCode?: number;
  failedStepIndex?: number;
  failedStepType?: WorkflowStepType;
  skippedStepIndexes: number[];
  continuedFailureSteps: number[];
};

type WorkflowExecutionOptions = {
  dryRun?: boolean;
  providedInputs?: Record<string, string>;
  allowInputPrompts?: boolean;
  allowShellApprovalPrompt?: boolean;
  allowNotifications?: boolean;
  allowInteractivePortSelection?: boolean;
  allowMonitorPortPrompt?: boolean;
  runId?: string;
  disallowedStepTypes?: Set<WorkflowStepType>;
};

type WorkflowStepExecutionResult = {
  success: boolean;
  exitCode?: number;
  message?: string;
};

export class WorkflowService {
  private static instance: WorkflowService;
  private configService: ConfigService;
  private serialPortService: SerialPortService;
  private serialMonitorService: SerialMonitorService;
  private terminalService: TerminalService;
  private logService: LogService;
  private workspaceStateService: WorkspaceStateService;
  private buildExecutionService: BuildExecutionService;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
    this.serialMonitorService = SerialMonitorService.getInstance();
    this.terminalService = TerminalService.getInstance();
    this.logService = LogService.getInstance();
    this.workspaceStateService = WorkspaceStateService.getInstance();
    this.buildExecutionService = BuildExecutionService.getInstance();
  }

  public static getInstance(): WorkflowService {
    if (!WorkflowService.instance) {
      WorkflowService.instance = new WorkflowService();
    }
    return WorkflowService.instance;
  }

  public getBuiltInStepTypes(): WorkflowStepType[] {
    return [
      'build.compile',
      'build.rebuild',
      'build.clean',
      'build.download',
      'build.menuconfig',
      'shell.command',
      'monitor.open',
      'monitor.close',
      'serial.selectPort'
    ];
  }

  public getResolvedWorkflows(): WorkflowDefinition[] {
    const workspace = this.getWorkspaceWorkflows();
    const global = this.getUserWorkflows();

    return this.mergeById(workspace, global);
  }

  public getWorkspaceWorkflows(): WorkflowDefinition[] {
    const inspect = vscode.workspace.getConfiguration('sifli-sdk-codekit').inspect('workflows');
    return this.asArray<WorkflowDefinition>(inspect?.workspaceValue);
  }

  public getUserWorkflows(): WorkflowDefinition[] {
    const inspect = vscode.workspace.getConfiguration('sifli-sdk-codekit').inspect('workflows');
    return this.asArray<WorkflowDefinition>(inspect?.globalValue);
  }

  public getWorkflowReference(scope: WorkflowScope, workflowId: string): WorkflowReference {
    return `${scope}:${workflowId}` as WorkflowReference;
  }

  public parseWorkflowReference(workflowRef: string): { scope: WorkflowScope; workflowId: string } | undefined {
    if (!workflowRef) {
      return undefined;
    }
    const separator = workflowRef.indexOf(':');
    if (separator <= 0) {
      return undefined;
    }
    const scope = workflowRef.slice(0, separator);
    const workflowId = workflowRef.slice(separator + 1).trim();
    if ((scope !== 'workspace' && scope !== 'user') || !workflowId) {
      return undefined;
    }
    return { scope, workflowId };
  }

  public getScopedWorkflows(scope: WorkflowScope): WorkflowDefinition[] {
    return scope === 'user' ? this.getUserWorkflows() : this.getWorkspaceWorkflows();
  }

  public getAllScopedWorkflows(): ScopedWorkflowDefinition[] {
    const scoped: ScopedWorkflowDefinition[] = [];
    for (const scope of ['workspace', 'user'] as const) {
      for (const workflow of this.getScopedWorkflows(scope)) {
        if (!workflow?.id) {
          continue;
        }
        scoped.push({
          scope,
          workflow,
          workflowRef: this.getWorkflowReference(scope, workflow.id)
        });
      }
    }
    return scoped;
  }

  public getWorkflowByReference(workflowRef: WorkflowReference | string): ScopedWorkflowDefinition | undefined {
    const parsed = this.parseWorkflowReference(workflowRef);
    if (!parsed) {
      return undefined;
    }
    const workflow = this.getScopedWorkflows(parsed.scope).find(item => item.id === parsed.workflowId);
    if (!workflow) {
      return undefined;
    }
    return {
      scope: parsed.scope,
      workflow,
      workflowRef: this.getWorkflowReference(parsed.scope, parsed.workflowId)
    };
  }

  public getResolvedStatusBarButtons(): WorkflowStatusBarButton[] {
    const workspace = this.getWorkspaceStatusBarButtons();
    const global = this.getUserStatusBarButtons();

    return this.mergeById(workspace, global);
  }

  public getWorkspaceStatusBarButtons(): WorkflowStatusBarButton[] {
    const inspect = vscode.workspace.getConfiguration('sifli-sdk-codekit').inspect('statusBar.buttons');
    return this.asArray<WorkflowStatusBarButton>(inspect?.workspaceValue);
  }

  public getUserStatusBarButtons(): WorkflowStatusBarButton[] {
    const inspect = vscode.workspace.getConfiguration('sifli-sdk-codekit').inspect('statusBar.buttons');
    return this.asArray<WorkflowStatusBarButton>(inspect?.globalValue);
  }

  public validateConfiguration(): WorkflowValidationIssue[] {
    const issues: WorkflowValidationIssue[] = [];
    const allowedSteps = new Set(this.getBuiltInStepTypes());
    const workspaceWorkflows = this.getWorkspaceWorkflows();
    const userWorkflows = this.getUserWorkflows();

    this.validateWorkflowList(workspaceWorkflows, 'workspace', allowedSteps, issues);
    this.validateWorkflowList(userWorkflows, 'user', allowedSteps, issues);

    const resolvedWorkflowIds = new Set(
      this.getResolvedWorkflows()
        .map(workflow => workflow.id?.trim())
        .filter((id): id is string => !!id)
    );
    this.validateStatusBarButtonList(
      this.getWorkspaceStatusBarButtons(),
      'workspace',
      resolvedWorkflowIds,
      issues
    );
    this.validateStatusBarButtonList(
      this.getUserStatusBarButtons(),
      'user',
      resolvedWorkflowIds,
      issues
    );

    return issues;
  }

  private validateWorkflowList(
    workflows: WorkflowDefinition[],
    scope: 'workspace' | 'user',
    allowedSteps: Set<WorkflowStepType>,
    issues: WorkflowValidationIssue[]
  ): void {
    const workflowIds = new Set<string>();
    workflows.forEach((workflow, index) => {
      const basePath = `${scope}.workflows[${index}]`;
      const workflowId = workflow.id?.trim();
      if (!workflowId) {
        issues.push({
          code: 'workflow.id.empty',
          path: `${basePath}.id`,
          message: 'Workflow id must be a non-empty string.'
        });
      } else if (workflowIds.has(workflowId)) {
        issues.push({
          code: 'workflow.id.duplicate',
          path: `${basePath}.id`,
          message: `Duplicate workflow id "${workflowId}".`
        });
      } else {
        workflowIds.add(workflowId);
      }

      if (!workflow.name || !workflow.name.trim()) {
        issues.push({
          code: 'workflow.name.empty',
          path: `${basePath}.name`,
          message: 'Workflow name must be a non-empty string.'
        });
      }

      if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
        issues.push({
          code: 'workflow.steps.empty',
          path: `${basePath}.steps`,
          message: 'Workflow must contain at least one step.'
        });
        return;
      }

      workflow.steps.forEach((step, stepIndex) => {
        if (!allowedSteps.has(step.type)) {
          issues.push({
            code: 'workflow.step.unsupported',
            path: `${basePath}.steps[${stepIndex}].type`,
            message: `Unsupported step type "${step.type}".`
          });
        }
        if (step.type === 'shell.command') {
          const command = typeof step.args?.command === 'string' ? step.args.command.trim() : '';
          if (!command) {
            issues.push({
              code: 'workflow.step.shell.command.empty',
              path: `${basePath}.steps[${stepIndex}].args.command`,
              message: 'shell.command step requires args.command.'
            });
          }
        }
      });
    });
  }

  private validateStatusBarButtonList(
    buttons: WorkflowStatusBarButton[],
    scope: 'workspace' | 'user',
    resolvedWorkflowIds: Set<string>,
    issues: WorkflowValidationIssue[]
  ): void {
    const buttonIds = new Set<string>();
    buttons.forEach((button, index) => {
      const basePath = `${scope}.statusBar.buttons[${index}]`;
      const buttonId = button.id?.trim();
      if (!buttonId) {
        issues.push({
          code: 'statusbar.id.empty',
          path: `${basePath}.id`,
          message: 'Status bar button id must be a non-empty string.'
        });
      } else if (buttonIds.has(buttonId)) {
        issues.push({
          code: 'statusbar.id.duplicate',
          path: `${basePath}.id`,
          message: `Duplicate status bar button id "${buttonId}".`
        });
      } else {
        buttonIds.add(buttonId);
      }

      if (!button.action || (button.action.kind !== 'workflow' && button.action.kind !== 'command')) {
        issues.push({
          code: 'statusbar.action.invalid',
          path: `${basePath}.action`,
          message: 'Button action.kind must be "workflow" or "command".'
        });
        return;
      }

      if (button.action.kind === 'workflow') {
        if (!button.action.workflowId) {
          issues.push({
            code: 'statusbar.action.workflowId.empty',
            path: `${basePath}.action.workflowId`,
            message: 'workflow action requires workflowId.'
          });
        } else if (!resolvedWorkflowIds.has(button.action.workflowId)) {
          issues.push({
            code: 'statusbar.action.workflowId.notFound',
            path: `${basePath}.action.workflowId`,
            message: `workflowId "${button.action.workflowId}" does not exist.`
          });
        }
      }

      if (button.action.kind === 'command' && !button.action.commandId) {
        issues.push({
          code: 'statusbar.action.commandId.empty',
          path: `${basePath}.action.commandId`,
          message: 'command action requires commandId.'
        });
      }
    });
  }

  public reportValidationIssues(showNotification = true): WorkflowValidationIssue[] {
    const issues = this.validateConfiguration();
    if (issues.length === 0) {
      return issues;
    }

    this.logService.warn(`Workflow configuration has ${issues.length} issue(s).`);
    issues.forEach(issue => {
      this.logService.warn(`[${issue.code}] ${issue.path} - ${issue.message}`);
    });

    if (showNotification) {
      const showDetails = vscode.l10n.t('Show details');
      void vscode.window
        .showWarningMessage(
          vscode.l10n.t('Workflow configuration has {0} issue(s).', String(issues.length)),
          showDetails
        )
        .then(async selection => {
          if (selection === showDetails) {
            this.logService.show();
            await vscode.commands.executeCommand('extension.workflows.showDiagnostics');
          }
        });
    }

    return issues;
  }

  public async showValidationDiagnostics(): Promise<void> {
    const issues = this.validateConfiguration();
    if (issues.length === 0) {
      vscode.window.showInformationMessage(vscode.l10n.t('Workflow configuration is valid.'));
      return;
    }

    const items = issues.map(issue => ({
      label: issue.code,
      description: issue.path,
      detail: issue.message
    }));
    await vscode.window.showQuickPick(items, {
      title: vscode.l10n.t('Workflow diagnostics ({0})', String(issues.length)),
      canPickMany: false,
      placeHolder: vscode.l10n.t('Select an item to review')
    });
  }

  public async executeWorkflow(workflowId: string, dryRun = false): Promise<boolean> {
    const scopedWorkflow = this.findResolvedWorkflowById(workflowId);
    if (!scopedWorkflow) {
      vscode.window.showErrorMessage(vscode.l10n.t('Workflow not found: {0}', workflowId));
      return false;
    }

    const result = await this.executeScopedWorkflow(scopedWorkflow, {
      dryRun,
      allowInputPrompts: true,
      allowShellApprovalPrompt: true,
      allowNotifications: true,
      allowInteractivePortSelection: true,
      allowMonitorPortPrompt: true
    });
    return result.success;
  }

  public getWorkflowToolCompatibility(workflowRef: WorkflowReference | string): WorkflowToolCompatibility {
    const scopedWorkflow = this.getWorkflowByReference(workflowRef);
    if (!scopedWorkflow) {
      return {
        runnable: false,
        reasons: [vscode.l10n.t('Workflow not found: {0}', String(workflowRef))],
        hasShellCommand: false
      };
    }

    return this.assessWorkflowToolCompatibility(scopedWorkflow);
  }

  public async executeWorkflowByReference(
    workflowRef: WorkflowReference | string,
    options?: {
      dryRun?: boolean;
      inputs?: Record<string, string>;
      runId?: string;
    }
  ): Promise<WorkflowExecutionResult> {
    const scopedWorkflow = this.getWorkflowByReference(workflowRef);
    if (!scopedWorkflow) {
      return {
        success: false,
        dryRun: options?.dryRun ?? false,
        workflowRef: typeof workflowRef === 'string' ? undefined : workflowRef,
        message: vscode.l10n.t('Workflow not found: {0}', String(workflowRef)),
        skippedStepIndexes: [],
        continuedFailureSteps: [],
        runId: options?.runId
      };
    }

    const compatibility = this.assessWorkflowToolCompatibility(scopedWorkflow);
    if (!compatibility.runnable) {
      return {
        success: false,
        workflowId: scopedWorkflow.workflow.id,
        workflowName: scopedWorkflow.workflow.name,
        workflowScope: scopedWorkflow.scope,
        workflowRef: scopedWorkflow.workflowRef,
        dryRun: options?.dryRun ?? false,
        runId: options?.runId,
        message: compatibility.reasons.join('; '),
        skippedStepIndexes: [],
        continuedFailureSteps: []
      };
    }

    return this.executeScopedWorkflow(scopedWorkflow, {
      dryRun: options?.dryRun,
      providedInputs: options?.inputs,
      allowInputPrompts: false,
      allowShellApprovalPrompt: false,
      allowNotifications: false,
      allowInteractivePortSelection: false,
      allowMonitorPortPrompt: false,
      runId: options?.runId,
      disallowedStepTypes: new Set<WorkflowStepType>(['build.menuconfig', 'serial.selectPort'])
    });
  }

  public async executeButtonAction(button: WorkflowStatusBarButton): Promise<void> {
    if (button.action.kind === 'workflow') {
      const workflowId = button.action.workflowId;
      if (!workflowId) {
        vscode.window.showErrorMessage(vscode.l10n.t('Button action missing workflowId.'));
        return;
      }
      await this.executeWorkflow(workflowId);
      return;
    }

    if (button.action.kind === 'command') {
      const commandId = button.action.commandId;
      if (!commandId) {
        vscode.window.showErrorMessage(vscode.l10n.t('Button action missing commandId.'));
        return;
      }
      await vscode.commands.executeCommand(commandId);
    }
  }

  public async saveWorkflows(
    workflows: WorkflowDefinition[],
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    await vscode.workspace.getConfiguration('sifli-sdk-codekit').update('workflows', workflows, target);
  }

  public async saveStatusBarButtons(
    buttons: WorkflowStatusBarButton[],
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    await vscode.workspace.getConfiguration('sifli-sdk-codekit').update('statusBar.buttons', buttons, target);
  }

  private async collectWorkflowInputs(inputs: WorkflowInputSpec[]): Promise<Record<string, string> | undefined> {
    const result: Record<string, string> = {};
    for (const input of inputs) {
      const value = await vscode.window.showInputBox({
        prompt: input.prompt,
        placeHolder: input.placeHolder,
        value: input.defaultValue,
        password: input.password,
        validateInput: text => {
          if (input.required && !text.trim()) {
            return vscode.l10n.t('This field is required.');
          }
          return null;
        }
      });

      if (value === undefined) {
        return undefined;
      }
      result[input.key] = value;
    }
    return result;
  }

  private async resolveWorkflowInputs(
    inputs: WorkflowInputSpec[],
    providedInputs: Record<string, string> | undefined,
    allowInputPrompts: boolean
  ): Promise<{ values?: Record<string, string>; error?: string }> {
    if (allowInputPrompts) {
      const values = await this.collectWorkflowInputs(inputs);
      return values
        ? { values: { ...(providedInputs ?? {}), ...values } }
        : { error: vscode.l10n.t('Workflow input collection was canceled.') };
    }

    const values: Record<string, string> = { ...(providedInputs ?? {}) };
    for (const input of inputs) {
      if (values[input.key] === undefined) {
        if (input.defaultValue !== undefined) {
          values[input.key] = input.defaultValue;
        } else if (input.required) {
          return {
            error: vscode.l10n.t('Workflow input is required: {0}', input.key)
          };
        }
      }
    }

    return { values };
  }

  private shouldRunStep(step: WorkflowStep): boolean {
    if (!step.runIf) {
      return true;
    }
    const boardSelected = !!this.configService.getSelectedBoardName() && this.configService.getSelectedBoardName() !== 'N/A';
    const serialPortSelected = !!this.serialPortService.selectedSerialPort;
    const monitorActive = this.serialMonitorService.hasActiveMonitor();

    if (step.runIf.boardSelected !== undefined && step.runIf.boardSelected !== boardSelected) {
      return false;
    }
    if (step.runIf.serialPortSelected !== undefined && step.runIf.serialPortSelected !== serialPortSelected) {
      return false;
    }
    if (step.runIf.monitorActive !== undefined && step.runIf.monitorActive !== monitorActive) {
      return false;
    }
    return true;
  }

  private resolveTemplate(input: string, values: Record<string, string>): string {
    return input.replace(/\$\{input:([^}]+)\}/g, (_, key) => values[key] ?? '');
  }

  private async executeStep(
    step: WorkflowStep,
    inputs: Record<string, string>,
    workflowId: string,
    workflowName: string,
    stepIndex: number,
    options: WorkflowExecutionOptions
  ): Promise<WorkflowStepExecutionResult> {
    try {
      switch (step.type) {
        case 'build.compile':
          return await this.runCompileStep(step, inputs, options);
        case 'build.rebuild':
          return await this.runRebuildStep(step, inputs, options);
        case 'build.clean':
          return this.runCleanStep(options);
        case 'build.download':
          return await this.runDownloadStep(step, inputs, options);
        case 'build.menuconfig':
          return await this.runMenuconfigStep(step, inputs, options);
        case 'shell.command':
          return await this.runShellCommandStep(step, inputs, workflowId, workflowName, stepIndex, options);
        case 'monitor.open':
          return await this.runMonitorOpenStep(options);
        case 'monitor.close':
          return {
            success: await this.serialMonitorService.closeSerialMonitor()
          };
        case 'serial.selectPort':
          if (!options.allowInteractivePortSelection) {
            return {
              success: false,
              message: vscode.l10n.t('Workflow step type is interactive-only and cannot run from language model tools: {0}', step.type)
            };
          }
          return {
            success: !!(await this.serialPortService.selectPort())
          };
        default:
          if (options.allowNotifications) {
            vscode.window.showWarningMessage(vscode.l10n.t('Unsupported workflow step: {0}', step.type));
          }
          return {
            success: false,
            message: vscode.l10n.t('Unsupported workflow step: {0}', step.type)
          };
      }
    } catch (error) {
      this.logService.error(`Workflow step failed: ${step.type}`, error);
      return {
        success: false,
        message: String(error)
      };
    }
  }

  private async runCompileStep(
    step: WorkflowStep,
    inputs: Record<string, string>,
    options: WorkflowExecutionOptions
  ): Promise<WorkflowStepExecutionResult> {
    const result = await this.buildExecutionService.executeCompileDetailed({
      templateValues: inputs,
      waitForExit: step.wait ?? true,
      showNotifications: options.allowNotifications,
      runId: options.runId
    });
    return {
      success: result.success,
      exitCode: result.exitCode,
      message: result.message
    };
  }

  private async runRebuildStep(
    step: WorkflowStep,
    inputs: Record<string, string>,
    options: WorkflowExecutionOptions
  ): Promise<WorkflowStepExecutionResult> {
    const cleanResult = this.runCleanStep(options);
    if (!cleanResult.success) {
      return cleanResult;
    }
    return this.runCompileStep(step, inputs, options);
  }

  private runCleanStep(options: WorkflowExecutionOptions): WorkflowStepExecutionResult {
    const result = this.buildExecutionService.executeCleanDetailed(options.allowNotifications);
    return {
      success: result.success,
      message: result.message
    };
  }

  private async runDownloadStep(
    step: WorkflowStep,
    inputs: Record<string, string>,
    options: WorkflowExecutionOptions
  ): Promise<WorkflowStepExecutionResult> {
    const closedMonitor = this.serialMonitorService.hasActiveMonitor()
      ? await this.serialMonitorService.closeSerialMonitor()
      : true;
    if (!closedMonitor) {
      this.logService.warn('Failed to close active serial monitor before download.');
    }

    const result = await this.buildExecutionService.executeDownloadDetailed({
      templateValues: inputs,
      waitForExit: step.wait ?? true,
      ensureBuildDirectory: false,
      showNotifications: options.allowNotifications,
      runId: options.runId
    });
    if (this.serialMonitorService.canResume()) {
      await this.serialMonitorService.resumeSerialMonitor();
    }
    return {
      success: result.success,
      exitCode: result.exitCode,
      message: result.message
    };
  }

  private async runMenuconfigStep(
    step: WorkflowStep,
    inputs: Record<string, string>,
    options: WorkflowExecutionOptions
  ): Promise<WorkflowStepExecutionResult> {
    const result = await this.buildExecutionService.executeMenuconfigDetailed({
      templateValues: inputs,
      waitForExit: step.wait ?? false,
      showNotifications: options.allowNotifications,
      runId: options.runId
    });
    return {
      success: result.success,
      exitCode: result.exitCode,
      message: result.message
    };
  }

  private async runShellCommandStep(
    step: WorkflowStep,
    inputs: Record<string, string>,
    workflowId: string,
    workflowName: string,
    stepIndex: number,
    options: WorkflowExecutionOptions
  ): Promise<WorkflowStepExecutionResult> {
    if (!vscode.workspace.isTrusted) {
      const message = vscode.l10n.t('shell.command step requires a trusted workspace.');
      if (options.allowNotifications) {
        vscode.window.showErrorMessage(message);
      }
      return { success: false, message };
    }

    const rawCommand = typeof step.args?.command === 'string' ? step.args.command : '';
    const commandTemplate = rawCommand.trim();
    const resolvedCommand = this.resolveTemplate(rawCommand, inputs).trim();
    if (!resolvedCommand) {
      const message = vscode.l10n.t('shell.command step requires args.command.');
      if (options.allowNotifications) {
        vscode.window.showErrorMessage(message);
      }
      return { success: false, message };
    }

    const approvalKey = `${workflowId}:${stepIndex}`;
    if (!this.workspaceStateService.isWorkflowShellApproved(approvalKey, commandTemplate)) {
      if (!options.allowShellApprovalPrompt) {
        return {
          success: false,
          message: vscode.l10n.t(
            'Workflow shell step requires prior approval in the workflow UI: {0}',
            workflowName
          )
        };
      }
      const runAction = vscode.l10n.t('Allow and run');
      const confirm = await vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Allow shell command execution for workflow "{0}" in this workspace?\nCommand: {1}',
          workflowName,
          resolvedCommand
        ),
        { modal: true },
        runAction
      );
      if (confirm !== runAction) {
        return {
          success: false,
          message: vscode.l10n.t('Workflow shell approval was canceled.')
        };
      }
      await this.workspaceStateService.approveWorkflowShell(approvalKey, commandTemplate);
    }

    const wait = step.wait ?? true;
    const exitCode = await this.terminalService.executeShellCommandInSiFliTerminal(
      resolvedCommand,
      TASK_NAMES.WORKFLOW_SHELL,
      { waitForExit: wait, runId: options.runId }
    );
    return {
      success: exitCode === undefined || exitCode === 0,
      exitCode
    };
  }

  private async runMonitorOpenStep(options: WorkflowExecutionOptions): Promise<WorkflowStepExecutionResult> {
    await this.serialMonitorService.initialize();
    const selectedSerialPort = this.serialPortService.selectedSerialPort || undefined;
    if (!selectedSerialPort && !options.allowMonitorPortPrompt) {
      return {
        success: false,
        message: vscode.l10n.t('Select a serial port first. Click "COM: N/A" in the status bar.')
      };
    }
    return {
      success: await this.serialMonitorService.openSerialMonitor(
        selectedSerialPort,
        this.serialPortService.monitorBaudRate
      )
    };
  }

  private asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private mergeById<T extends { id: string }>(workspaceItems: T[], globalOverrides: T[]): T[] {
    const merged = new Map<string, T>();
    workspaceItems.forEach(item => {
      if (item?.id) {
        merged.set(item.id, item);
      }
    });
    globalOverrides.forEach(item => {
      if (item?.id) {
        merged.set(item.id, item);
      }
    });
    return Array.from(merged.values());
  }

  private validateWorkflowForExecution(workflow: WorkflowDefinition): string[] {
    const issues: string[] = [];
    const allowedSteps = new Set(this.getBuiltInStepTypes());

    if (!workflow.id || !workflow.id.trim()) {
      issues.push('workflow id is empty');
    }
    if (!workflow.name || !workflow.name.trim()) {
      issues.push('workflow name is empty');
    }
    if (!Array.isArray(workflow.steps)) {
      issues.push('steps is not an array');
      return issues;
    }

    workflow.steps.forEach((step, index) => {
      if (!allowedSteps.has(step.type)) {
        issues.push(`unsupported step type at #${index + 1}: ${step.type}`);
      }
      if (step.type === 'shell.command') {
        const command = typeof step.args?.command === 'string' ? step.args.command.trim() : '';
        if (!command) {
          issues.push(`shell.command missing args.command at #${index + 1}`);
        }
      }
    });

    return issues;
  }

  private findResolvedWorkflowById(workflowId: string): ScopedWorkflowDefinition | undefined {
    const userWorkflow = this.getUserWorkflows().find(item => item.id === workflowId);
    if (userWorkflow) {
      return {
        scope: 'user',
        workflow: userWorkflow,
        workflowRef: this.getWorkflowReference('user', workflowId)
      };
    }

    const workspaceWorkflow = this.getWorkspaceWorkflows().find(item => item.id === workflowId);
    if (workspaceWorkflow) {
      return {
        scope: 'workspace',
        workflow: workspaceWorkflow,
        workflowRef: this.getWorkflowReference('workspace', workflowId)
      };
    }

    return undefined;
  }

  private assessWorkflowToolCompatibility(scopedWorkflow: ScopedWorkflowDefinition): WorkflowToolCompatibility {
    const reasons = new Set<string>();
    const validationIssues = this.validateWorkflowForExecution(scopedWorkflow.workflow);
    validationIssues.forEach(issue => reasons.add(issue));
    const steps = Array.isArray(scopedWorkflow.workflow.steps) ? scopedWorkflow.workflow.steps : [];

    const hasBoard = this.isBoardSelected();
    const hasSerialPort = !!this.serialPortService.selectedSerialPort;
    const hasShellCommand = steps.some(step => step.type === 'shell.command');

    steps.forEach((step, index) => {
      if (step.type === 'build.menuconfig') {
        reasons.add(vscode.l10n.t('Workflow step type is not supported by language model tools: {0}', step.type));
      }
      if (step.type === 'serial.selectPort') {
        reasons.add(vscode.l10n.t('Workflow step type is interactive-only and cannot run from language model tools: {0}', step.type));
      }
      if ((step.type === 'build.compile' || step.type === 'build.rebuild' || step.type === 'build.clean' || step.type === 'build.download') && !hasBoard) {
        reasons.add(vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.'));
      }
      if ((step.type === 'build.download' || step.type === 'monitor.open') && !hasSerialPort) {
        reasons.add(vscode.l10n.t('Select a serial port first. Click "COM: N/A" in the status bar.'));
      }
      if (step.type === 'shell.command') {
        if (!vscode.workspace.isTrusted) {
          reasons.add(vscode.l10n.t('shell.command step requires a trusted workspace.'));
        } else {
          const rawCommand = typeof step.args?.command === 'string' ? step.args.command : '';
          const commandTemplate = rawCommand.trim();
          const approvalKey = `${scopedWorkflow.workflow.id}:${index}`;
          if (commandTemplate && !this.workspaceStateService.isWorkflowShellApproved(approvalKey, commandTemplate)) {
            reasons.add(vscode.l10n.t('Workflow shell step requires prior approval in the workflow UI: {0}', scopedWorkflow.workflow.name));
          }
        }
      }
    });

    return {
      runnable: reasons.size === 0,
      reasons: Array.from(reasons),
      hasShellCommand
    };
  }

  private async executeScopedWorkflow(
    scopedWorkflow: ScopedWorkflowDefinition,
    options: WorkflowExecutionOptions
  ): Promise<WorkflowExecutionResult> {
    const workflow = scopedWorkflow.workflow;
    const dryRun = options.dryRun ?? false;
    const allowNotifications = options.allowNotifications ?? true;
    const disallowedStepTypes = options.disallowedStepTypes ?? new Set<WorkflowStepType>();

    const executionIssues = this.validateWorkflowForExecution(workflow);
    if (executionIssues.length > 0) {
      const message = vscode.l10n.t('Workflow "{0}" is invalid: {1}', workflow.name, executionIssues.join('; '));
      if (allowNotifications) {
        vscode.window.showErrorMessage(message);
      }
      return {
        success: false,
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowScope: scopedWorkflow.scope,
        workflowRef: scopedWorkflow.workflowRef,
        dryRun,
        runId: options.runId,
        message,
        skippedStepIndexes: [],
        continuedFailureSteps: []
      };
    }

    const blockedStep = workflow.steps.find(step => disallowedStepTypes.has(step.type));
    if (blockedStep) {
      const message = vscode.l10n.t('Workflow step type is not supported by language model tools: {0}', blockedStep.type);
      return {
        success: false,
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowScope: scopedWorkflow.scope,
        workflowRef: scopedWorkflow.workflowRef,
        dryRun,
        runId: options.runId,
        message,
        skippedStepIndexes: [],
        continuedFailureSteps: []
      };
    }

    const resolvedInputs = await this.resolveWorkflowInputs(
      workflow.inputs ?? [],
      options.providedInputs,
      options.allowInputPrompts ?? true
    );
    if (!resolvedInputs.values) {
      return {
        success: false,
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowScope: scopedWorkflow.scope,
        workflowRef: scopedWorkflow.workflowRef,
        dryRun,
        runId: options.runId,
        message: resolvedInputs.error,
        skippedStepIndexes: [],
        continuedFailureSteps: []
      };
    }

    if (dryRun) {
      const preview = workflow.steps.map((step, i) => `${i + 1}. ${getWorkflowStepDisplayLabel(step)}`).join('\n');
      if (allowNotifications) {
        vscode.window.showInformationMessage(vscode.l10n.t('Dry Run: {0}\n{1}', workflow.name, preview));
      }
      return {
        success: true,
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowScope: scopedWorkflow.scope,
        workflowRef: scopedWorkflow.workflowRef,
        dryRun: true,
        runId: options.runId,
        message: preview,
        skippedStepIndexes: [],
        continuedFailureSteps: []
      };
    }

    const policy = workflow.failurePolicy ?? 'stop';
    this.logService.info(`Running workflow: ${workflow.id}`);

    if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      const message = vscode.l10n.t('Workflow has no steps: {0}', workflow.name);
      if (allowNotifications) {
        vscode.window.showInformationMessage(message);
      }
      return {
        success: true,
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowScope: scopedWorkflow.scope,
        workflowRef: scopedWorkflow.workflowRef,
        dryRun: false,
        runId: options.runId,
        message,
        skippedStepIndexes: [],
        continuedFailureSteps: []
      };
    }

    const skippedStepIndexes: number[] = [];
    const continuedFailureSteps: number[] = [];
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      if (!this.shouldRunStep(step)) {
        this.logService.info(`Skip workflow step #${i + 1}: ${step.type}`);
        skippedStepIndexes.push(i);
        continue;
      }

      const stepResult = await this.executeStep(
        step,
        resolvedInputs.values,
        workflow.id,
        workflow.name,
        i,
        options
      );
      if (stepResult.success) {
        continue;
      }

      const continueOnError = step.continueOnError ?? policy === 'continue';
      const stepLabel = `${workflow.name} #${i + 1} (${getWorkflowStepDisplayLabel(step)})`;
      if (!continueOnError) {
        const message = stepResult.message
          ? `${vscode.l10n.t('Workflow stopped at step: {0}', stepLabel)} ${stepResult.message}`
          : vscode.l10n.t('Workflow stopped at step: {0}', stepLabel);
        if (allowNotifications) {
          vscode.window.showErrorMessage(vscode.l10n.t('Workflow stopped at step: {0}', stepLabel));
        }
        return {
          success: false,
          workflowId: workflow.id,
          workflowName: workflow.name,
          workflowScope: scopedWorkflow.scope,
          workflowRef: scopedWorkflow.workflowRef,
          dryRun: false,
          runId: options.runId,
          message,
          exitCode: stepResult.exitCode,
          failedStepIndex: i,
          failedStepType: step.type,
          skippedStepIndexes,
          continuedFailureSteps
        };
      }
      continuedFailureSteps.push(i);
      this.logService.warn(`Workflow step failed but continued: ${stepLabel}`);
    }

    const finishedMessage = workflow.name
      ? vscode.l10n.t('Workflow finished: {0}', workflow.name)
      : undefined;
    if (allowNotifications) {
      vscode.window.showInformationMessage(vscode.l10n.t('Workflow finished: {0}', workflow.name));
    }
    return {
      success: true,
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowScope: scopedWorkflow.scope,
      workflowRef: scopedWorkflow.workflowRef,
      dryRun: false,
      runId: options.runId,
      message: finishedMessage,
      skippedStepIndexes,
      continuedFailureSteps
    };
  }

  private isBoardSelected(): boolean {
    const boardName = this.configService.getSelectedBoardName();
    return !!boardName && boardName !== 'N/A';
  }
}
