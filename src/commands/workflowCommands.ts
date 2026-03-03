import * as vscode from 'vscode';
import { CMD_PREFIX } from '../constants';
import {
  WorkflowDefinition,
  WorkflowStatusBarAction,
  WorkflowStatusBarButton,
  WorkflowStep,
  WorkflowStepType
} from '../types';
import { WorkflowService } from '../services/workflowService';
import { StatusBarProvider } from '../providers/statusBarProvider';
import { getWorkflowStepDisplayLabel, getWorkflowStepTypeLabel } from '../utils/workflowStepLabel';

type ConfigTargetOption = {
  label: string;
  target: vscode.ConfigurationTarget;
};

export class WorkflowCommands {
  private static instance: WorkflowCommands;
  private workflowService: WorkflowService;
  private statusBarProvider: StatusBarProvider;

  private constructor() {
    this.workflowService = WorkflowService.getInstance();
    this.statusBarProvider = StatusBarProvider.getInstance();
  }

  public static getInstance(): WorkflowCommands {
    if (!WorkflowCommands.instance) {
      WorkflowCommands.instance = new WorkflowCommands();
    }
    return WorkflowCommands.instance;
  }

  public async openManager(): Promise<void> {
    const actions = [
      { label: vscode.l10n.t('Run workflow'), action: 'run' },
      { label: vscode.l10n.t('Dry run workflow'), action: 'dryRun' },
      { label: vscode.l10n.t('Create workflow'), action: 'create' },
      { label: vscode.l10n.t('Edit workflow'), action: 'edit' },
      { label: vscode.l10n.t('Copy workflow'), action: 'copy' },
      { label: vscode.l10n.t('Delete workflow'), action: 'delete' },
      { label: vscode.l10n.t('Pin workflow to status bar'), action: 'pin' },
      { label: vscode.l10n.t('Show workflow diagnostics'), action: 'diagnostics' }
    ];
    const picked = await vscode.window.showQuickPick(actions, {
      title: vscode.l10n.t('Workflows'),
      placeHolder: vscode.l10n.t('Select an action')
    });
    if (!picked) {
      return;
    }

    switch (picked.action) {
      case 'run':
        await this.runWorkflow();
        break;
      case 'dryRun':
        await this.runWorkflow(undefined, true);
        break;
      case 'create':
        await this.createWorkflow();
        break;
      case 'edit':
        await this.editWorkflow();
        break;
      case 'copy':
        await this.copyWorkflow();
        break;
      case 'delete':
        await this.deleteWorkflow();
        break;
      case 'pin':
        await this.pinWorkflowToStatusBar();
        break;
      case 'diagnostics':
        await this.workflowService.showValidationDiagnostics();
        break;
      default:
        break;
    }
  }

  public async runWorkflow(workflowId?: string, dryRun = false): Promise<void> {
    const workflow = workflowId
      ? this.workflowService.getResolvedWorkflows().find(item => item.id === workflowId)
      : await this.pickWorkflow();
    if (!workflow) {
      return;
    }
    await this.workflowService.executeWorkflow(workflow.id, dryRun);
  }

  public async createWorkflow(): Promise<void> {
    const targetOption = await this.pickConfigTarget();
    if (!targetOption) {
      return;
    }
    const workflows = this.getEditableWorkflows(targetOption.target);

    const template = await vscode.window.showQuickPick(
      [
        { label: vscode.l10n.t('Build + Download'), value: 'buildDownload' },
        { label: vscode.l10n.t('Clean + Build + Download + Monitor'), value: 'fullFlow' },
        { label: vscode.l10n.t('Empty workflow'), value: 'empty' }
      ],
      {
        title: vscode.l10n.t('Create workflow'),
        placeHolder: vscode.l10n.t('Select a template')
      }
    );
    if (!template) {
      return;
    }

    const id = this.generateWorkflowId(workflows.map(item => item.id), targetOption.target);

    const name = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Workflow name'),
      value: id
    });
    if (!name) {
      return;
    }

    let steps: WorkflowStep[] = [];
    if (template.value === 'buildDownload') {
      steps = [
        { type: 'build.compile', wait: true },
        { type: 'build.download', wait: true }
      ];
    } else if (template.value === 'fullFlow') {
      steps = [
        { type: 'build.clean' },
        { type: 'build.compile', wait: true },
        { type: 'build.download', wait: true },
        { type: 'monitor.open' }
      ];
    } else {
      // Empty workflow template: create immediately, user can add steps later from tree actions.
      steps = [];
    }

    const workflow: WorkflowDefinition = {
      id,
      name: name.trim(),
      failurePolicy: 'stop',
      steps
    };
    workflows.push(workflow);

    await this.workflowService.saveWorkflows(workflows, targetOption.target);
    this.statusBarProvider.updateStatusBarItems();
    vscode.window.showInformationMessage(vscode.l10n.t('Workflow created: {0}', workflow.name));
  }

  public async editWorkflow(workflowId?: string): Promise<void> {
    const targetOption = await this.pickConfigTarget();
    if (!targetOption) {
      return;
    }
    const workflows = this.getEditableWorkflows(targetOption.target);
    const workflow = workflowId
      ? workflows.find(item => item.id === workflowId)
      : await this.pickWorkflowFromList(workflows);
    if (!workflow) {
      return;
    }

    const action = await vscode.window.showQuickPick(
      [
        { label: vscode.l10n.t('Rename'), value: 'rename' },
        { label: vscode.l10n.t('Change failure policy'), value: 'policy' },
        { label: vscode.l10n.t('Add steps'), value: 'addSteps' },
        { label: vscode.l10n.t('Remove step'), value: 'removeStep' }
      ],
      { title: vscode.l10n.t('Edit workflow: {0}', workflow.name) }
    );
    if (!action) {
      return;
    }

    if (action.value === 'rename') {
      const newName = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Workflow name'),
        value: workflow.name
      });
      if (!newName) {
        return;
      }
      workflow.name = newName.trim();
    }

    if (action.value === 'policy') {
      const policy = await vscode.window.showQuickPick(
        [
          { label: 'stop', value: 'stop' as const },
          { label: 'continue', value: 'continue' as const }
        ],
        { title: vscode.l10n.t('Failure policy') }
      );
      if (!policy) {
        return;
      }
      workflow.failurePolicy = policy.value;
    }

    if (action.value === 'addSteps') {
      const steps = await this.collectStepsFromWizard();
      if (steps.length === 0) {
        return;
      }
      workflow.steps.push(...steps);
    }

    if (action.value === 'removeStep') {
      if (workflow.steps.length === 0) {
        vscode.window.showWarningMessage(vscode.l10n.t('Workflow has no steps.'));
        return;
      }
      const stepPick = await vscode.window.showQuickPick(
        workflow.steps.map((step, index) => ({
          label: `${index + 1}. ${getWorkflowStepDisplayLabel(step)}`,
          value: index
        })),
        { title: vscode.l10n.t('Remove step') }
      );
      if (!stepPick) {
        return;
      }
      workflow.steps.splice(stepPick.value, 1);
      if (workflow.steps.length === 0) {
        vscode.window.showWarningMessage(vscode.l10n.t('Workflow must keep at least one step.'));
        return;
      }
    }

    await this.workflowService.saveWorkflows(workflows, targetOption.target);
    this.statusBarProvider.updateStatusBarItems();
    vscode.window.showInformationMessage(vscode.l10n.t('Workflow updated: {0}', workflow.name));
  }

  public async copyWorkflow(input?: string | { metadata?: Record<string, string> }): Promise<void> {
    const context = this.parseWorkflowContext(input);
    let source: WorkflowDefinition | undefined;

    if (context.workflowId) {
      source = this.workflowService.getResolvedWorkflows().find(item => item.id === context.workflowId);
    } else {
      source = await this.pickWorkflow();
    }
    if (!source) {
      if (context.workflowId) {
        vscode.window.showWarningMessage(vscode.l10n.t('Workflow not found: {0}', context.workflowId));
      }
      return;
    }

    try {
      const targetOption = await this.pickConfigTarget();
      if (!targetOption) {
        return;
      }
      const targetWorkflows = this.getEditableWorkflows(targetOption.target);

      const copiedName = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Workflow name'),
        value: `${source.name} Copy`,
        validateInput: value => (!value.trim() ? vscode.l10n.t('Workflow name is required.') : null)
      });
      if (!copiedName) {
        return;
      }

      const copiedId = this.generateWorkflowId(
        targetWorkflows.map(item => item.id),
        targetOption.target
      );

      const copied: WorkflowDefinition = {
        ...source,
        id: copiedId,
        name: copiedName.trim(),
        steps: (Array.isArray(source.steps) ? source.steps : []).map(step => ({ ...step }))
      };
      targetWorkflows.push(copied);
      await this.workflowService.saveWorkflows(targetWorkflows, targetOption.target);
      this.statusBarProvider.updateStatusBarItems();
      vscode.window.showInformationMessage(vscode.l10n.t('Workflow copied: {0}', copied.name));
    } catch (error) {
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to copy workflow: {0}', String(error)));
    }
  }

  public async deleteWorkflow(workflowId?: string | { metadata?: Record<string, string> }): Promise<void> {
    const context = this.parseWorkflowContext(workflowId);
    let target: vscode.ConfigurationTarget;
    let workflows: WorkflowDefinition[];
    let workflow: WorkflowDefinition | undefined;

    if (context.workflowId && context.workflowScope) {
      target = context.workflowScope === 'user'
        ? vscode.ConfigurationTarget.Global
        : vscode.ConfigurationTarget.Workspace;
      workflows = this.getEditableWorkflows(target);
      workflow = workflows.find(item => item.id === context.workflowId);
      if (!workflow) {
        vscode.window.showWarningMessage(vscode.l10n.t('Workflow not found: {0}', context.workflowId));
        return;
      }
    } else {
      const targetOption = await this.pickConfigTarget();
      if (!targetOption) {
        return;
      }
      target = targetOption.target;
      workflows = this.getEditableWorkflows(target);
      workflow = context.workflowId
        ? workflows.find(item => item.id === context.workflowId)
        : await this.pickWorkflowFromList(workflows);
      if (!workflow) {
        return;
      }
    }

    const confirm = await vscode.window.showWarningMessage(
      vscode.l10n.t('Delete workflow "{0}"?', workflow.name),
      { modal: true },
      vscode.l10n.t('Delete')
    );
    if (!confirm) {
      return;
    }

    const filtered = workflows.filter(item => item.id !== workflow.id);
    await this.workflowService.saveWorkflows(filtered, target);
    this.statusBarProvider.updateStatusBarItems();
    vscode.window.showInformationMessage(vscode.l10n.t('Workflow deleted: {0}', workflow.name));
  }

  public async pinWorkflowToStatusBar(workflowId?: string): Promise<void> {
    const workflow = workflowId
      ? this.workflowService.getResolvedWorkflows().find(item => item.id === workflowId)
      : await this.pickWorkflow();
    if (!workflow) {
      return;
    }

    const targetOption = await this.pickConfigTarget();
    if (!targetOption) {
      return;
    }

    const buttons = this.getEditableButtons(targetOption.target);
    const buttonId = this.generateStatusBarButtonId(
      buttons.map(item => item.id),
      targetOption.target
    );

    const buttonText = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Status bar button text'),
      value: `$(rocket) ${workflow.name}`
    });
    if (!buttonText) {
      return;
    }

    const button: WorkflowStatusBarButton = {
      id: buttonId,
      text: buttonText,
      tooltip: workflow.name,
      priority: 90,
      action: {
        kind: 'workflow',
        workflowId: workflow.id
      }
    };

    const existingIdx = buttons.findIndex(item => item.id === button.id);
    if (existingIdx >= 0) {
      buttons[existingIdx] = button;
    } else {
      buttons.push(button);
    }

    await this.workflowService.saveStatusBarButtons(buttons, targetOption.target);
    this.statusBarProvider.updateStatusBarItems();
    vscode.window.showInformationMessage(vscode.l10n.t('Pinned workflow to status bar: {0}', workflow.name));
  }

  public async deleteStatusBarButton(
    input?: string | { metadata?: Record<string, string> }
  ): Promise<void> {
    const context = this.parseStatusBarButtonContext(input);
    let target: vscode.ConfigurationTarget;
    let buttons: WorkflowStatusBarButton[];
    let button: WorkflowStatusBarButton | undefined;

    if (context.buttonId && context.buttonScope) {
      target = context.buttonScope === 'user'
        ? vscode.ConfigurationTarget.Global
        : vscode.ConfigurationTarget.Workspace;
      buttons = this.getEditableButtons(target);
      button = buttons.find(item => item.id === context.buttonId);
      if (!button) {
        vscode.window.showWarningMessage(vscode.l10n.t('Status bar button not found: {0}', context.buttonId));
        return;
      }
    } else {
      const targetOption = await this.pickConfigTarget();
      if (!targetOption) {
        return;
      }
      target = targetOption.target;
      buttons = this.getEditableButtons(target);
      if (context.buttonId) {
        button = buttons.find(item => item.id === context.buttonId);
      } else {
        const picked = await vscode.window.showQuickPick(
          buttons.map(item => ({
            label: item.text,
            description: item.id,
            value: item
          })),
          { title: vscode.l10n.t('Select status bar button to delete') }
        );
        button = picked?.value;
      }
      if (!button) {
        return;
      }
    }

    const confirm = await vscode.window.showWarningMessage(
      vscode.l10n.t('Delete status bar button "{0}"?', this.getStatusBarButtonDisplayName(button)),
      { modal: true },
      vscode.l10n.t('Delete')
    );
    if (!confirm) {
      return;
    }

    const filtered = buttons.filter(item => item.id !== button.id);
    await this.workflowService.saveStatusBarButtons(filtered, target);
    this.statusBarProvider.updateStatusBarItems();
  }

  public async renameStatusBarButton(
    input?: string | { metadata?: Record<string, string> }
  ): Promise<void> {
    const context = this.parseStatusBarButtonContext(input);
    const located = this.getEditableStatusBarButtonById(context.buttonId, context.buttonScope);
    if (!located) {
      if (context.buttonId) {
        vscode.window.showWarningMessage(vscode.l10n.t('Status bar button not found: {0}', context.buttonId));
      }
      return;
    }

    const newText = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Status bar button text'),
      value: located.button.text,
      validateInput: value => (!value.trim() ? vscode.l10n.t('Button text is required.') : null)
    });
    if (!newText) {
      return;
    }

    located.button.text = newText.trim();
    await this.workflowService.saveStatusBarButtons(located.buttons, located.target);
    this.statusBarProvider.updateStatusBarItems();
  }

  public async copyStatusBarButton(
    input?: string | { metadata?: Record<string, string> }
  ): Promise<void> {
    const context = this.parseStatusBarButtonContext(input);
    const source = this.findStatusBarButton(context.buttonId);
    if (!source) {
      if (context.buttonId) {
        vscode.window.showWarningMessage(vscode.l10n.t('Status bar button not found: {0}', context.buttonId));
      }
      return;
    }

    const targetOption = await this.pickConfigTarget();
    if (!targetOption) {
      return;
    }
    const targetButtons = this.getEditableButtons(targetOption.target);

    const copiedText = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Status bar button text'),
      value: source.text,
      validateInput: value => (!value.trim() ? vscode.l10n.t('Button text is required.') : null)
    });
    if (!copiedText) {
      return;
    }

    const copiedId = this.generateStatusBarButtonId(
      targetButtons.map(item => item.id),
      targetOption.target
    );

    const copied: WorkflowStatusBarButton = {
      ...source,
      id: copiedId,
      text: copiedText.trim(),
      action: { ...source.action }
    };
    targetButtons.push(copied);
    await this.workflowService.saveStatusBarButtons(targetButtons, targetOption.target);
    this.statusBarProvider.updateStatusBarItems();
  }

  public async overrideDefaultStatusBarButton(
    input?: string | { metadata?: Record<string, string> }
  ): Promise<void> {
    const context = this.parseStatusBarButtonContext(input);
    const buttonId = context.buttonId;
    if (!buttonId) {
      return;
    }

    const defaultButton = this.statusBarProvider.getDefaultWorkflowButtons().find(item => item.id === buttonId);
    if (!defaultButton) {
      vscode.window.showWarningMessage(vscode.l10n.t('Status bar button not found: {0}', buttonId));
      return;
    }

    const action = await this.pickStatusBarButtonAction();
    if (!action) {
      return;
    }

    const workspaceButtons = this.getEditableButtons(vscode.ConfigurationTarget.Workspace);
    const existingIndex = workspaceButtons.findIndex(item => item.id === defaultButton.id);
    const baseButton = existingIndex >= 0 ? workspaceButtons[existingIndex] : defaultButton;
    const overridden: WorkflowStatusBarButton = {
      ...baseButton,
      id: defaultButton.id,
      action
    };
    if (existingIndex >= 0) {
      workspaceButtons[existingIndex] = overridden;
    } else {
      workspaceButtons.push(overridden);
    }

    await this.workflowService.saveStatusBarButtons(workspaceButtons, vscode.ConfigurationTarget.Workspace);
    this.statusBarProvider.updateStatusBarItems();
    vscode.window.showInformationMessage(
      vscode.l10n.t(
        'Default status bar button overridden in workspace: {0}',
        this.getStatusBarButtonDisplayName(defaultButton)
      )
    );
  }

  public async renameWorkflow(
    workflowIdOrItem?: string | { metadata?: Record<string, string> }
  ): Promise<void> {
    const context = this.parseWorkflowContext(workflowIdOrItem);
    const workflowId = context.workflowId;
    if (!workflowId) {
      return;
    }

    const located = this.getEditableWorkflowById(workflowId, context.workflowScope);
    if (!located) {
      vscode.window.showWarningMessage(vscode.l10n.t('Workflow is not editable (resolved from merged config): {0}', workflowId));
      return;
    }

    const newName = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Workflow name'),
      value: located.workflow.name,
      validateInput: value => {
        if (!value.trim()) {
          return vscode.l10n.t('Workflow name is required.');
        }
        return null;
      }
    });
    if (!newName) {
      return;
    }

    located.workflow.name = newName.trim();
    await this.workflowService.saveWorkflows(located.workflows, located.target);
    this.statusBarProvider.updateStatusBarItems();
    vscode.window.showInformationMessage(vscode.l10n.t('Workflow renamed: {0}', located.workflow.name));
  }

  public async addStep(
    workflowIdOrItem?: string | { metadata?: Record<string, string> }
  ): Promise<void> {
    const context = this.parseWorkflowContext(workflowIdOrItem);
    const workflowId = context.workflowId;
    if (!workflowId) {
      return;
    }

    const located = this.getEditableWorkflowById(workflowId, context.workflowScope);
    if (!located) {
      vscode.window.showWarningMessage(vscode.l10n.t('Workflow is not editable (resolved from merged config): {0}', workflowId));
      return;
    }

    const step = await this.collectSingleStepFromWizard();
    if (!step) {
      return;
    }
    this.ensureWorkflowSteps(located.workflow);
    located.workflow.steps.push(step);
    await this.workflowService.saveWorkflows(located.workflows, located.target);
    this.statusBarProvider.updateStatusBarItems();
    vscode.window.showInformationMessage(vscode.l10n.t('Added step to workflow: {0}', located.workflow.name));
  }

  public async deleteStep(
    item?: { metadata?: Record<string, string> }
  ): Promise<void> {
    const context = this.parseWorkflowContext(item);
    const workflowId = context.workflowId;
    const stepIndexText = item?.metadata?.stepIndex;
    if (!workflowId || stepIndexText === undefined) {
      return;
    }
    const stepIndex = Number(stepIndexText);
    if (Number.isNaN(stepIndex)) {
      return;
    }

    const located = this.getEditableWorkflowById(workflowId, context.workflowScope);
    if (!located) {
      vscode.window.showWarningMessage(vscode.l10n.t('Workflow is not editable (resolved from merged config): {0}', workflowId));
      return;
    }
    this.ensureWorkflowSteps(located.workflow);
    if (stepIndex < 0 || stepIndex >= located.workflow.steps.length) {
      return;
    }
    if (located.workflow.steps.length <= 1) {
      vscode.window.showWarningMessage(vscode.l10n.t('Workflow must keep at least one step.'));
      return;
    }

    located.workflow.steps.splice(stepIndex, 1);
    await this.workflowService.saveWorkflows(located.workflows, located.target);
    this.statusBarProvider.updateStatusBarItems();
  }

  public async moveStepUp(
    item?: { metadata?: Record<string, string> }
  ): Promise<void> {
    await this.moveStep(item, -1);
  }

  public async moveStepDown(
    item?: { metadata?: Record<string, string> }
  ): Promise<void> {
    await this.moveStep(item, 1);
  }

  private async collectStepsFromWizard(): Promise<WorkflowStep[]> {
    const steps: WorkflowStep[] = [];
    const availableStepTypes = this.workflowService.getBuiltInStepTypes();

    while (true) {
      const selected = await vscode.window.showQuickPick(
        [
          ...availableStepTypes.map(stepType => ({
            label: getWorkflowStepTypeLabel(stepType),
            description: stepType,
            value: stepType
          })),
          { label: vscode.l10n.t('Done'), value: '__done__' }
        ],
        {
          title: vscode.l10n.t('Workflow steps'),
          placeHolder: vscode.l10n.t('Select a step type')
        }
      );
      if (!selected || selected.value === '__done__') {
        break;
      }
      const step = await this.buildStepFromSelectedType(selected.value as WorkflowStepType);
      if (!step) {
        continue;
      }
      steps.push(step);
    }

    return steps;
  }

  private async collectSingleStepFromWizard(): Promise<WorkflowStep | undefined> {
    const availableStepTypes = this.workflowService.getBuiltInStepTypes();
    const selected = await vscode.window.showQuickPick(
      availableStepTypes.map(stepType => ({
        label: getWorkflowStepTypeLabel(stepType),
        description: stepType,
        value: stepType
      })),
      {
        title: vscode.l10n.t('Add step'),
        placeHolder: vscode.l10n.t('Select a step type')
      }
    );
    if (!selected) {
      return undefined;
    }
    return this.buildStepFromSelectedType(selected.value as WorkflowStepType);
  }

  private async pickWorkflow(): Promise<WorkflowDefinition | undefined> {
    const workflows = this.workflowService.getResolvedWorkflows();
    return this.pickWorkflowFromList(workflows);
  }

  private async pickWorkflowFromList(workflows: WorkflowDefinition[]): Promise<WorkflowDefinition | undefined> {
    if (workflows.length === 0) {
      vscode.window.showWarningMessage(vscode.l10n.t('No workflows configured.'));
      return undefined;
    }
    const selected = await vscode.window.showQuickPick(
      workflows.map(item => ({
        label: item.name,
        description: item.id,
        detail: `${Array.isArray(item.steps) ? item.steps.length : 0} step(s)`,
        value: item
      })),
      {
        title: vscode.l10n.t('Workflows'),
        placeHolder: vscode.l10n.t('Select a workflow')
      }
    );
    return selected?.value;
  }

  private async pickConfigTarget(): Promise<ConfigTargetOption | undefined> {
    const selected = await vscode.window.showQuickPick<ConfigTargetOption>(
      [
        { label: vscode.l10n.t('Workspace (shared)'), target: vscode.ConfigurationTarget.Workspace },
        { label: vscode.l10n.t('User (override)'), target: vscode.ConfigurationTarget.Global }
      ],
      {
        title: vscode.l10n.t('Save target'),
        placeHolder: vscode.l10n.t('Choose where to store this configuration')
      }
    );
    return selected;
  }

  private getEditableWorkflows(target: vscode.ConfigurationTarget): WorkflowDefinition[] {
    const inspect = vscode.workspace
      .getConfiguration('sifli-sdk-codekit')
      .inspect<WorkflowDefinition[]>('workflows');
    const source =
      target === vscode.ConfigurationTarget.Global ? inspect?.globalValue : inspect?.workspaceValue;
    return Array.isArray(source)
      ? source.map(item => ({ ...item, steps: Array.isArray(item.steps) ? [...item.steps] : [] }))
      : [];
  }

  private getEditableButtons(target: vscode.ConfigurationTarget): WorkflowStatusBarButton[] {
    const inspect = vscode.workspace
      .getConfiguration('sifli-sdk-codekit')
      .inspect<WorkflowStatusBarButton[]>('statusBar.buttons');
    const source =
      target === vscode.ConfigurationTarget.Global ? inspect?.globalValue : inspect?.workspaceValue;
    return Array.isArray(source) ? source.map(item => ({ ...item, action: { ...item.action } })) : [];
  }

  private async moveStep(
    item: { metadata?: Record<string, string> } | undefined,
    delta: -1 | 1
  ): Promise<void> {
    const context = this.parseWorkflowContext(item);
    const workflowId = context.workflowId;
    const stepIndexText = item?.metadata?.stepIndex;
    if (!workflowId || stepIndexText === undefined) {
      return;
    }
    const stepIndex = Number(stepIndexText);
    if (Number.isNaN(stepIndex)) {
      return;
    }

    const located = this.getEditableWorkflowById(workflowId, context.workflowScope);
    if (!located) {
      vscode.window.showWarningMessage(vscode.l10n.t('Workflow is not editable (resolved from merged config): {0}', workflowId));
      return;
    }
    this.ensureWorkflowSteps(located.workflow);

    const targetIndex = stepIndex + delta;
    if (
      stepIndex < 0 ||
      stepIndex >= located.workflow.steps.length ||
      targetIndex < 0 ||
      targetIndex >= located.workflow.steps.length
    ) {
      return;
    }

    const [moved] = located.workflow.steps.splice(stepIndex, 1);
    located.workflow.steps.splice(targetIndex, 0, moved);
    await this.workflowService.saveWorkflows(located.workflows, located.target);
    this.statusBarProvider.updateStatusBarItems();
  }

  private getEditableWorkflowById(
    workflowId: string,
    scope?: 'workspace' | 'user'
  ): { target: vscode.ConfigurationTarget; workflows: WorkflowDefinition[]; workflow: WorkflowDefinition } | undefined {
    if (scope === 'workspace') {
      const workspaceWorkflows = this.getEditableWorkflows(vscode.ConfigurationTarget.Workspace);
      const workspaceWorkflow = workspaceWorkflows.find(item => item.id === workflowId);
      if (workspaceWorkflow) {
        return {
          target: vscode.ConfigurationTarget.Workspace,
          workflows: workspaceWorkflows,
          workflow: workspaceWorkflow
        };
      }
      return undefined;
    }

    if (scope === 'user') {
      const globalWorkflows = this.getEditableWorkflows(vscode.ConfigurationTarget.Global);
      const globalWorkflow = globalWorkflows.find(item => item.id === workflowId);
      if (globalWorkflow) {
        return {
          target: vscode.ConfigurationTarget.Global,
          workflows: globalWorkflows,
          workflow: globalWorkflow
        };
      }
      return undefined;
    }

    const workspaceWorkflows = this.getEditableWorkflows(vscode.ConfigurationTarget.Workspace);
    const workspaceWorkflow = workspaceWorkflows.find(item => item.id === workflowId);
    if (workspaceWorkflow) {
      return {
        target: vscode.ConfigurationTarget.Workspace,
        workflows: workspaceWorkflows,
        workflow: workspaceWorkflow
      };
    }

    const globalWorkflows = this.getEditableWorkflows(vscode.ConfigurationTarget.Global);
    const globalWorkflow = globalWorkflows.find(item => item.id === workflowId);
    if (globalWorkflow) {
      return {
        target: vscode.ConfigurationTarget.Global,
        workflows: globalWorkflows,
        workflow: globalWorkflow
      };
    }

    return undefined;
  }

  private parseWorkflowContext(
    input?: string | { metadata?: Record<string, string> }
  ): { workflowId?: string; workflowScope?: 'workspace' | 'user' } {
    if (typeof input === 'string') {
      return { workflowId: input };
    }
    const workflowId = input?.metadata?.workflowId;
    const rawScope = input?.metadata?.workflowScope;
    const workflowScope = rawScope === 'workspace' || rawScope === 'user' ? rawScope : undefined;
    return { workflowId, workflowScope };
  }

  private ensureWorkflowSteps(workflow: WorkflowDefinition): void {
    if (!Array.isArray(workflow.steps)) {
      workflow.steps = [];
    }
  }

  private parseStatusBarButtonContext(
    input?: string | { metadata?: Record<string, string> }
  ): { buttonId?: string; buttonScope?: 'workspace' | 'user' } {
    if (typeof input === 'string') {
      return { buttonId: input };
    }
    const buttonId = input?.metadata?.buttonId;
    const rawScope = input?.metadata?.buttonScope;
    const buttonScope = rawScope === 'workspace' || rawScope === 'user' ? rawScope : undefined;
    return { buttonId, buttonScope };
  }

  private getEditableStatusBarButtonById(
    buttonId?: string,
    scope?: 'workspace' | 'user'
  ): {
    target: vscode.ConfigurationTarget;
    buttons: WorkflowStatusBarButton[];
    button: WorkflowStatusBarButton;
  } | undefined {
    if (!buttonId) {
      return undefined;
    }
    if (scope === 'workspace') {
      const buttons = this.getEditableButtons(vscode.ConfigurationTarget.Workspace);
      const button = buttons.find(item => item.id === buttonId);
      return button ? { target: vscode.ConfigurationTarget.Workspace, buttons, button } : undefined;
    }
    if (scope === 'user') {
      const buttons = this.getEditableButtons(vscode.ConfigurationTarget.Global);
      const button = buttons.find(item => item.id === buttonId);
      return button ? { target: vscode.ConfigurationTarget.Global, buttons, button } : undefined;
    }

    const workspaceButtons = this.getEditableButtons(vscode.ConfigurationTarget.Workspace);
    const workspaceButton = workspaceButtons.find(item => item.id === buttonId);
    if (workspaceButton) {
      return { target: vscode.ConfigurationTarget.Workspace, buttons: workspaceButtons, button: workspaceButton };
    }
    const userButtons = this.getEditableButtons(vscode.ConfigurationTarget.Global);
    const userButton = userButtons.find(item => item.id === buttonId);
    if (userButton) {
      return { target: vscode.ConfigurationTarget.Global, buttons: userButtons, button: userButton };
    }
    return undefined;
  }

  private findStatusBarButton(buttonId?: string): WorkflowStatusBarButton | undefined {
    if (!buttonId) {
      return undefined;
    }
    return this.workflowService.getResolvedStatusBarButtons().find(item => item.id === buttonId);
  }

  private getStatusBarButtonDisplayName(button: WorkflowStatusBarButton): string {
    const raw = button.text || '';
    const match = raw.match(/^\s*\$\([^)]+\)\s*(.*)$/);
    const label = match ? (match[1] || '').trim() : raw.trim();
    return label || raw.trim() || button.id;
  }

  private async pickStatusBarButtonAction(): Promise<WorkflowStatusBarAction | undefined> {
    const actionType = await vscode.window.showQuickPick(
      [
        { label: vscode.l10n.t('Bind to workflow'), value: 'workflow' as const },
        { label: vscode.l10n.t('Bind to command'), value: 'command' as const }
      ],
      {
        title: vscode.l10n.t('Status bar button action'),
        placeHolder: vscode.l10n.t('Select an action type')
      }
    );
    if (!actionType) {
      return undefined;
    }

    if (actionType.value === 'workflow') {
      const workflow = await this.pickWorkflow();
      if (!workflow) {
        return undefined;
      }
      return { kind: 'workflow', workflowId: workflow.id };
    }

    const commandOption = await vscode.window.showQuickPick(
      [
        { label: vscode.l10n.t('Build (Compile)'), value: CMD_PREFIX + 'compile' },
        { label: vscode.l10n.t('Rebuild'), value: CMD_PREFIX + 'rebuild' },
        { label: vscode.l10n.t('Clean'), value: CMD_PREFIX + 'clean' },
        { label: vscode.l10n.t('Download'), value: CMD_PREFIX + 'download' },
        { label: vscode.l10n.t('Menuconfig'), value: CMD_PREFIX + 'menuconfig' },
        { label: vscode.l10n.t('Open Serial Monitor'), value: CMD_PREFIX + 'openDeviceMonitor' },
        { label: vscode.l10n.t('Close Serial Monitor'), value: CMD_PREFIX + 'closeDeviceMonitor' }
      ],
      {
        title: vscode.l10n.t('Status bar button action'),
        placeHolder: vscode.l10n.t('Select a command')
      }
    );
    if (!commandOption) {
      return undefined;
    }
    return { kind: 'command', commandId: commandOption.value };
  }

  private async buildStepFromSelectedType(type: WorkflowStepType): Promise<WorkflowStep | undefined> {
    const wait = await vscode.window.showQuickPick(
      [
        { label: vscode.l10n.t('Wait for step to finish'), value: true },
        { label: vscode.l10n.t('Do not wait'), value: false }
      ],
      {
        title: getWorkflowStepTypeLabel(type),
        placeHolder: vscode.l10n.t('Execution mode')
      }
    );
    if (!wait) {
      return undefined;
    }

    const continueOnError = await vscode.window.showQuickPick(
      [
        { label: vscode.l10n.t('Stop on error'), value: false },
        { label: vscode.l10n.t('Continue on error'), value: true }
      ],
      {
        title: getWorkflowStepTypeLabel(type),
        placeHolder: vscode.l10n.t('Failure behavior')
      }
    );
    if (!continueOnError) {
      return undefined;
    }

    let args: Record<string, string | number | boolean> | undefined;
    let stepName: string | undefined;
    if (type === 'shell.command') {
      const alias = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Step alias'),
        placeHolder: vscode.l10n.t('Example: Prepare env'),
        validateInput: value => (!value.trim() ? vscode.l10n.t('Alias is required.') : null)
      });
      if (!alias) {
        return undefined;
      }
      stepName = alias.trim();

      const command = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Shell command to run'),
        placeHolder: vscode.l10n.t('Example: echo hello'),
        validateInput: value => (!value.trim() ? vscode.l10n.t('Command is required.') : null)
      });
      if (!command) {
        return undefined;
      }
      args = { command: command.trim() };
    }

    return {
      name: stepName,
      type,
      wait: wait.value,
      continueOnError: continueOnError.value,
      args
    };
  }

  private generateWorkflowId(existingIds: string[], target: vscode.ConfigurationTarget): string {
    const pad = (num: number): string => String(num).padStart(2, '0');
    const now = new Date();
    const prefix = target === vscode.ConfigurationTarget.Workspace ? 'wswf' : 'uswf';
    const base = `${prefix}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const existing = new Set(existingIds);
    if (!existing.has(base)) {
      return base;
    }

    let index = 1;
    while (existing.has(`${base}_${index}`)) {
      index++;
    }
    return `${base}_${index}`;
  }

  private generateStatusBarButtonId(existingIds: string[], target: vscode.ConfigurationTarget): string {
    const pad = (num: number): string => String(num).padStart(2, '0');
    const now = new Date();
    const prefix = target === vscode.ConfigurationTarget.Workspace ? 'wsb' : 'usrb';
    const base = `${prefix}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const existing = new Set(existingIds);
    if (!existing.has(base)) {
      return base;
    }

    let index = 1;
    while (existing.has(`${base}_${index}`)) {
      index++;
    }
    return `${base}_${index}`;
  }
}
