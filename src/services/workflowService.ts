import * as vscode from 'vscode';
import { TASK_NAMES } from '../constants';
import {
  WorkflowDefinition,
  WorkflowInputSpec,
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
    const workflow = this.getResolvedWorkflows().find(item => item.id === workflowId);
    if (!workflow) {
      vscode.window.showErrorMessage(vscode.l10n.t('Workflow not found: {0}', workflowId));
      return false;
    }

    const executionIssues = this.validateWorkflowForExecution(workflow);
    if (executionIssues.length > 0) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Workflow "{0}" is invalid: {1}', workflow.name, executionIssues.join('; '))
      );
      return false;
    }

    const inputs = await this.collectWorkflowInputs(workflow.inputs ?? []);
    if (!inputs) {
      return false;
    }

    if (dryRun) {
      const preview = workflow.steps.map((step, i) => `${i + 1}. ${getWorkflowStepDisplayLabel(step)}`).join('\n');
      vscode.window.showInformationMessage(vscode.l10n.t('Dry Run: {0}\n{1}', workflow.name, preview));
      return true;
    }

    const policy = workflow.failurePolicy ?? 'stop';
    this.logService.info(`Running workflow: ${workflow.id}`);

    if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      vscode.window.showInformationMessage(vscode.l10n.t('Workflow has no steps: {0}', workflow.name));
      return true;
    }

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      if (!this.shouldRunStep(step)) {
        this.logService.info(`Skip workflow step #${i + 1}: ${step.type}`);
        continue;
      }

      const stepOk = await this.executeStep(step, inputs, workflow.id, workflow.name, i);
      if (stepOk) {
        continue;
      }

      const continueOnError = step.continueOnError ?? policy === 'continue';
      const stepLabel = `${workflow.name} #${i + 1} (${getWorkflowStepDisplayLabel(step)})`;
      if (!continueOnError) {
        vscode.window.showErrorMessage(vscode.l10n.t('Workflow stopped at step: {0}', stepLabel));
        return false;
      }
      this.logService.warn(`Workflow step failed but continued: ${stepLabel}`);
    }

    vscode.window.showInformationMessage(vscode.l10n.t('Workflow finished: {0}', workflow.name));
    return true;
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
    stepIndex: number
  ): Promise<boolean> {
    try {
      switch (step.type) {
        case 'build.compile':
          return await this.runCompileStep(step, inputs);
        case 'build.rebuild':
          return await this.runRebuildStep(step, inputs);
        case 'build.clean':
          return this.runCleanStep();
        case 'build.download':
          return await this.runDownloadStep(step, inputs);
        case 'build.menuconfig':
          return await this.runMenuconfigStep(step, inputs);
        case 'shell.command':
          return await this.runShellCommandStep(step, inputs, workflowId, workflowName, stepIndex);
        case 'monitor.open':
          return await this.runMonitorOpenStep();
        case 'monitor.close':
          return await this.serialMonitorService.closeSerialMonitor();
        case 'serial.selectPort':
          return !!(await this.serialPortService.selectPort());
        default:
          vscode.window.showWarningMessage(vscode.l10n.t('Unsupported workflow step: {0}', step.type));
          return false;
      }
    } catch (error) {
      this.logService.error(`Workflow step failed: ${step.type}`, error);
      return false;
    }
  }

  private async runCompileStep(step: WorkflowStep, inputs: Record<string, string>): Promise<boolean> {
    return this.buildExecutionService.executeCompile({
      templateValues: inputs,
      waitForExit: step.wait ?? true
    });
  }

  private async runRebuildStep(step: WorkflowStep, inputs: Record<string, string>): Promise<boolean> {
    const cleanOk = this.runCleanStep();
    if (!cleanOk) {
      return false;
    }
    return this.runCompileStep(step, inputs);
  }

  private runCleanStep(): boolean {
    return this.buildExecutionService.executeClean();
  }

  private async runDownloadStep(step: WorkflowStep, inputs: Record<string, string>): Promise<boolean> {
    const closedMonitor = this.serialMonitorService.hasActiveMonitor()
      ? await this.serialMonitorService.closeSerialMonitor()
      : true;
    if (!closedMonitor) {
      this.logService.warn('Failed to close active serial monitor before download.');
    }

    const ok = await this.buildExecutionService.executeDownload({
      templateValues: inputs,
      waitForExit: step.wait ?? true,
      ensureBuildDirectory: false
    });
    if (this.serialMonitorService.canResume()) {
      await this.serialMonitorService.resumeSerialMonitor();
    }
    return ok;
  }

  private async runMenuconfigStep(step: WorkflowStep, inputs: Record<string, string>): Promise<boolean> {
    return this.buildExecutionService.executeMenuconfig({
      templateValues: inputs,
      waitForExit: step.wait ?? false
    });
  }

  private async runShellCommandStep(
    step: WorkflowStep,
    inputs: Record<string, string>,
    workflowId: string,
    workflowName: string,
    stepIndex: number
  ): Promise<boolean> {
    if (!vscode.workspace.isTrusted) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('shell.command step requires a trusted workspace.')
      );
      return false;
    }

    const rawCommand = typeof step.args?.command === 'string' ? step.args.command : '';
    const commandTemplate = rawCommand.trim();
    const resolvedCommand = this.resolveTemplate(rawCommand, inputs).trim();
    if (!resolvedCommand) {
      vscode.window.showErrorMessage(vscode.l10n.t('shell.command step requires args.command.'));
      return false;
    }

    const approvalKey = `${workflowId}:${stepIndex}`;
    if (!this.workspaceStateService.isWorkflowShellApproved(approvalKey, commandTemplate)) {
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
        return false;
      }
      await this.workspaceStateService.approveWorkflowShell(approvalKey, commandTemplate);
    }

    const wait = step.wait ?? true;
    const exitCode = await this.terminalService.executeShellCommandInSiFliTerminal(
      resolvedCommand,
      TASK_NAMES.WORKFLOW_SHELL,
      { waitForExit: wait }
    );
    return exitCode === undefined || exitCode === 0;
  }

  private async runMonitorOpenStep(): Promise<boolean> {
    await this.serialMonitorService.initialize();
    const selectedSerialPort = this.serialPortService.selectedSerialPort || undefined;
    return this.serialMonitorService.openSerialMonitor(selectedSerialPort, this.serialPortService.monitorBaudRate);
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
}
