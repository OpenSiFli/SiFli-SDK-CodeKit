import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { TERMINAL_NAME } from '../constants';
import {
  SdkVersion,
  WorkflowDefinition,
  WorkflowReference,
  WorkflowScope,
  WorkflowStatusBarButton,
  WorkflowValidationIssue,
} from '../types';
import { StatusBarProvider } from '../providers/statusBarProvider';
import { isSiFliProject } from '../utils/projectUtils';
import { BoardService } from './boardService';
import { BuildExecutionService } from './buildExecutionService';
import { ClangdService } from './clangdService';
import { ConfigService } from './configService';
import { GitService } from './gitService';
import { LogService } from './logService';
import { CreateProjectFromTemplateOptions, ProjectCreationService } from './projectCreationService';
import { SerialMonitorService } from './serialMonitorService';
import { SerialPortService } from './serialPortService';
import { SdkService } from './sdkService';
import { WorkflowService } from './workflowService';
import { WorkspaceStateService } from './workspaceStateService';

type EmptyInput = Record<string, never>;

export type ProjectState = {
  isSiFliProject: boolean;
  currentSdk: {
    version: string;
    path: string;
    valid: boolean;
  } | null;
  selectedBoard: string | null;
  numThreads: number;
  selectedSerialPort: string | null;
  downloadBaudRate: number;
  monitorBaudRate: number;
  monitorActive: boolean;
  workflowCounts: {
    workspace: number;
    user: number;
    resolved: number;
  };
};

export class AutomationService {
  private static instance: AutomationService;

  private readonly workflowService: WorkflowService;
  private readonly configService: ConfigService;
  private readonly boardService: BoardService;
  private readonly serialPortService: SerialPortService;
  private readonly serialMonitorService: SerialMonitorService;
  private readonly buildExecutionService: BuildExecutionService;
  private readonly statusBarProvider: StatusBarProvider;
  private readonly logService: LogService;
  private readonly sdkService: SdkService;
  private readonly gitService: GitService;
  private readonly projectCreationService: ProjectCreationService;
  private readonly clangdService: ClangdService;
  private readonly workspaceStateService: WorkspaceStateService;

  private constructor() {
    this.workflowService = WorkflowService.getInstance();
    this.configService = ConfigService.getInstance();
    this.boardService = BoardService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
    this.serialMonitorService = SerialMonitorService.getInstance();
    this.buildExecutionService = BuildExecutionService.getInstance();
    this.statusBarProvider = StatusBarProvider.getInstance();
    this.logService = LogService.getInstance();
    this.sdkService = SdkService.getInstance();
    this.gitService = GitService.getInstance();
    this.projectCreationService = ProjectCreationService.getInstance();
    this.clangdService = ClangdService.getInstance();
    this.workspaceStateService = WorkspaceStateService.getInstance();
  }

  public static getInstance(): AutomationService {
    if (!AutomationService.instance) {
      AutomationService.instance = new AutomationService();
    }
    return AutomationService.instance;
  }

  public async getProjectStatePayload(_input: EmptyInput = {}): Promise<unknown> {
    return {
      success: true,
      operation: 'getProjectState',
      state: this.getProjectState(),
    };
  }

  public getProjectState(): ProjectState {
    const currentSdk = this.configService.getCurrentSdk();
    const selectedBoard = this.configService.getSelectedBoardName();
    return {
      isSiFliProject: isSiFliProject(),
      currentSdk: currentSdk
        ? {
            version: currentSdk.version,
            path: currentSdk.path,
            valid: currentSdk.valid,
          }
        : null,
      selectedBoard: selectedBoard && selectedBoard !== 'N/A' ? selectedBoard : null,
      numThreads: this.configService.getNumThreads(),
      selectedSerialPort: this.serialPortService.selectedSerialPort,
      downloadBaudRate: this.serialPortService.downloadBaudRate,
      monitorBaudRate: this.serialPortService.monitorBaudRate,
      monitorActive: this.serialMonitorService.hasActiveMonitor(),
      workflowCounts: {
        workspace: this.workflowService.getWorkspaceWorkflows().length,
        user: this.workflowService.getUserWorkflows().length,
        resolved: this.workflowService.getResolvedWorkflows().length,
      },
    };
  }

  public async listWorkflows(input: { scope?: 'workspace' | 'user' | 'all' } = {}): Promise<unknown> {
    const scope = input.scope ?? 'all';
    const workflows = this.workflowService
      .getAllScopedWorkflows()
      .filter(item => scope === 'all' || item.scope === scope)
      .map(item => this.describeWorkflow(item.workflowRef));

    return {
      success: true,
      operation: 'listWorkflows',
      scope,
      workflows,
      state: this.getProjectState(),
    };
  }

  public async getWorkflow(input: { workflowRef: string }): Promise<unknown> {
    const scopedWorkflow = this.workflowService.getWorkflowByReference(input.workflowRef);
    if (!scopedWorkflow) {
      return {
        success: false,
        operation: 'getWorkflow',
        message: vscode.l10n.t('Workflow not found: {0}', input.workflowRef),
        state: this.getProjectState(),
      };
    }

    return {
      success: true,
      operation: 'getWorkflow',
      workflow: this.describeWorkflow(scopedWorkflow.workflowRef),
      definition: this.cloneWorkflow(scopedWorkflow.workflow),
      state: this.getProjectState(),
    };
  }

  public async validateWorkflows(
    input: {
      workflow?: WorkflowDefinition;
    } = {}
  ): Promise<unknown> {
    const issues = input.workflow
      ? this.validateWorkflowDefinition(input.workflow)
      : this.workflowService.validateConfiguration();
    return {
      success: true,
      operation: 'validateWorkflows',
      valid: issues.length === 0,
      issues,
      state: this.getProjectState(),
    };
  }

  public async runWorkflow(input: { workflowRef: string; inputs?: Record<string, string> }): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const runId = this.createRunId('workflow');
    const result = await this.workflowService.executeWorkflowByReference(input.workflowRef as WorkflowReference, {
      inputs: input.inputs,
      runId,
    });

    return {
      success: result.success,
      operation: 'runWorkflow',
      workflowRef: result.workflowRef ?? input.workflowRef,
      workflowName: result.workflowName,
      workflowScope: result.workflowScope,
      dryRun: result.dryRun,
      runId: result.runId,
      terminalName: result.runId ? TERMINAL_NAME : undefined,
      exitCode: result.exitCode,
      failedStepIndex: result.failedStepIndex,
      failedStepType: result.failedStepType,
      skippedStepIndexes: result.skippedStepIndexes,
      continuedFailureSteps: result.continuedFailureSteps,
      message: result.message,
      state: this.getProjectState(),
    };
  }

  public async createWorkflow(input: { scope: WorkflowScope; workflow: WorkflowDefinition }): Promise<unknown> {
    const validationIssues = this.validateWorkflowDefinition(input.workflow);
    if (validationIssues.length > 0) {
      return {
        success: false,
        operation: 'createWorkflow',
        message: validationIssues.map(issue => issue.message).join('; '),
        issues: validationIssues,
        state: this.getProjectState(),
      };
    }

    const target = this.configurationTargetFromScope(input.scope);
    const workflows = this.getEditableWorkflows(target);
    if (workflows.some(item => item.id === input.workflow.id)) {
      return {
        success: false,
        operation: 'createWorkflow',
        message: vscode.l10n.t('Duplicate workflow id "{0}".', input.workflow.id),
        state: this.getProjectState(),
      };
    }

    workflows.push(this.cloneWorkflow(input.workflow));
    await this.workflowService.saveWorkflows(workflows, target);
    this.statusBarProvider.updateStatusBarItems();

    return {
      success: true,
      operation: 'createWorkflow',
      workflowRef: this.workflowService.getWorkflowReference(input.scope, input.workflow.id),
      workflow: input.workflow,
      issues: this.workflowService.validateConfiguration(),
      state: this.getProjectState(),
    };
  }

  public async updateWorkflow(input: { workflowRef: string; workflow: WorkflowDefinition }): Promise<unknown> {
    const located = this.getEditableWorkflowByReference(input.workflowRef);
    if (!located) {
      return {
        success: false,
        operation: 'updateWorkflow',
        message: vscode.l10n.t('Workflow not found: {0}', input.workflowRef),
        state: this.getProjectState(),
      };
    }

    if (located.workflow.id !== input.workflow.id) {
      return {
        success: false,
        operation: 'updateWorkflow',
        message: vscode.l10n.t('Workflow id cannot be changed: {0}', located.workflow.id),
        state: this.getProjectState(),
      };
    }

    const validationIssues = this.validateWorkflowDefinition(input.workflow);
    if (validationIssues.length > 0) {
      return {
        success: false,
        operation: 'updateWorkflow',
        message: validationIssues.map(issue => issue.message).join('; '),
        issues: validationIssues,
        state: this.getProjectState(),
      };
    }

    const index = located.workflows.findIndex(item => item.id === located.workflow.id);
    located.workflows[index] = this.cloneWorkflow(input.workflow);
    await this.workflowService.saveWorkflows(located.workflows, located.target);
    this.statusBarProvider.updateStatusBarItems();

    return {
      success: true,
      operation: 'updateWorkflow',
      workflowRef: input.workflowRef,
      workflow: input.workflow,
      issues: this.workflowService.validateConfiguration(),
      state: this.getProjectState(),
    };
  }

  public async deleteWorkflow(input: { workflowRef: string }): Promise<unknown> {
    const located = this.getEditableWorkflowByReference(input.workflowRef);
    if (!located) {
      return {
        success: false,
        operation: 'deleteWorkflow',
        message: vscode.l10n.t('Workflow not found: {0}', input.workflowRef),
        state: this.getProjectState(),
      };
    }

    const nextWorkflows = located.workflows.filter(item => item.id !== located.workflow.id);
    await this.workflowService.saveWorkflows(nextWorkflows, located.target);
    this.statusBarProvider.updateStatusBarItems();

    return {
      success: true,
      operation: 'deleteWorkflow',
      workflowRef: input.workflowRef,
      deletedWorkflowId: located.workflow.id,
      state: this.getProjectState(),
    };
  }

  public async saveStatusBarButton(input: { scope: WorkflowScope; button: WorkflowStatusBarButton }): Promise<unknown> {
    const validationMessage = this.validateStatusBarButton(input.button);
    if (validationMessage) {
      return {
        success: false,
        operation: 'saveStatusBarButton',
        message: validationMessage,
        state: this.getProjectState(),
      };
    }

    const target = this.configurationTargetFromScope(input.scope);
    const buttons = this.getEditableButtons(target);
    const index = buttons.findIndex(item => item.id === input.button.id);
    const cloned = this.cloneStatusBarButton(input.button);
    if (index >= 0) {
      buttons[index] = cloned;
    } else {
      buttons.push(cloned);
    }

    await this.workflowService.saveStatusBarButtons(buttons, target);
    this.statusBarProvider.updateStatusBarItems();

    return {
      success: true,
      operation: 'saveStatusBarButton',
      button: cloned,
      state: this.getProjectState(),
    };
  }

  public async deleteStatusBarButton(input: { scope: WorkflowScope; buttonId: string }): Promise<unknown> {
    const target = this.configurationTargetFromScope(input.scope);
    const buttons = this.getEditableButtons(target);
    const exists = buttons.some(item => item.id === input.buttonId);
    if (!exists) {
      return {
        success: false,
        operation: 'deleteStatusBarButton',
        message: vscode.l10n.t('Status bar button not found: {0}', input.buttonId),
        state: this.getProjectState(),
      };
    }

    await this.workflowService.saveStatusBarButtons(
      buttons.filter(item => item.id !== input.buttonId),
      target
    );
    this.statusBarProvider.updateStatusBarItems();

    return {
      success: true,
      operation: 'deleteStatusBarButton',
      buttonId: input.buttonId,
      state: this.getProjectState(),
    };
  }

  public async approveWorkflowShellStep(input: {
    workflowRef: string;
    stepIndex: number;
    commandTemplate: string;
  }): Promise<unknown> {
    const scopedWorkflow = this.workflowService.getWorkflowByReference(input.workflowRef);
    if (!scopedWorkflow) {
      return {
        success: false,
        operation: 'approveWorkflowShellStep',
        message: vscode.l10n.t('Workflow not found: {0}', input.workflowRef),
        state: this.getProjectState(),
      };
    }

    const steps = Array.isArray(scopedWorkflow.workflow.steps) ? scopedWorkflow.workflow.steps : [];
    if (input.stepIndex < 0 || input.stepIndex >= steps.length) {
      return {
        success: false,
        operation: 'approveWorkflowShellStep',
        message: vscode.l10n.t('Workflow step index out of range: {0}', String(input.stepIndex)),
        state: this.getProjectState(),
      };
    }

    const step = steps[input.stepIndex];
    if (step.type !== 'shell.command') {
      return {
        success: false,
        operation: 'approveWorkflowShellStep',
        message: vscode.l10n.t('Workflow step is not a shell.command step: {0}', String(input.stepIndex)),
        state: this.getProjectState(),
      };
    }

    const commandTemplate = typeof step.args?.command === 'string' ? step.args.command.trim() : '';
    if (commandTemplate !== input.commandTemplate.trim()) {
      return {
        success: false,
        operation: 'approveWorkflowShellStep',
        message: vscode.l10n.t('Workflow shell command template does not match current configuration.'),
        state: this.getProjectState(),
      };
    }

    const approvalKey = this.workspaceStateService.buildWorkflowShellApprovalKey(
      scopedWorkflow.workflowRef,
      input.stepIndex,
      commandTemplate
    );
    await this.workspaceStateService.approveWorkflowShell(approvalKey);

    return {
      success: true,
      operation: 'approveWorkflowShellStep',
      workflowRef: scopedWorkflow.workflowRef,
      stepIndex: input.stepIndex,
      state: this.getProjectState(),
    };
  }

  public async listBoards(): Promise<unknown> {
    const boards = await this.boardService.discoverBoards();
    const selectedBoard = this.configService.getSelectedBoardName();
    return {
      success: true,
      operation: 'listBoards',
      boards: boards.map(board => ({
        name: board.name,
        type: board.type,
        path: board.path,
        selected: board.name === selectedBoard,
      })),
      state: this.getProjectState(),
    };
  }

  public async selectBoard(input: { boardName: string; numThreads?: number }): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const boards = await this.boardService.discoverBoards();
    const board = boards.find(item => item.name === input.boardName);
    if (!board) {
      return {
        success: false,
        operation: 'selectBoard',
        message: vscode.l10n.t('Board not found: {0}', input.boardName),
        boards: boards.map(item => item.name),
        state: this.getProjectState(),
      };
    }

    if (input.numThreads !== undefined && (!Number.isInteger(input.numThreads) || input.numThreads <= 0)) {
      return {
        success: false,
        operation: 'selectBoard',
        message: vscode.l10n.t('Build threads must be a positive integer.'),
        state: this.getProjectState(),
      };
    }

    await this.configService.setSelectedBoardName(board.name);
    if (input.numThreads !== undefined) {
      await this.configService.setNumThreads(input.numThreads);
    }
    this.statusBarProvider.updateStatusBarItems();

    return {
      success: true,
      operation: 'selectBoard',
      board,
      numThreads: this.configService.getNumThreads(),
      state: this.getProjectState(),
    };
  }

  public async listSerialPorts(): Promise<unknown> {
    const ports = await this.serialPortService.getSerialPorts();
    const selectedPort = this.serialPortService.selectedSerialPort;
    const supportedBaudRates = SerialPortService.getBaudRates();
    return {
      success: true,
      operation: 'listSerialPorts',
      ports: ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
        vendorId: port.vendorId,
        productId: port.productId,
        selected: port.path === selectedPort,
        supportedBaudRates,
        currentDownloadBaudRate: this.serialPortService.downloadBaudRate,
        currentMonitorBaudRate: this.serialPortService.monitorBaudRate,
      })),
      state: this.getProjectState(),
    };
  }

  public async selectSerialPort(input: {
    port: string;
    downloadBaud?: number;
    monitorBaud?: number;
  }): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const ports = await this.serialPortService.getSerialPorts();
    const port = ports.find(item => item.path === input.port);
    if (!port) {
      return {
        success: false,
        operation: 'selectSerialPort',
        message: vscode.l10n.t('Serial port not found: {0}', input.port),
        ports: ports.map(item => item.path),
        state: this.getProjectState(),
      };
    }

    const supportedBaudRates = new Set(SerialPortService.getBaudRates());
    if (input.downloadBaud !== undefined && !supportedBaudRates.has(input.downloadBaud)) {
      return {
        success: false,
        operation: 'selectSerialPort',
        message: vscode.l10n.t('Unsupported download baud rate: {0}', String(input.downloadBaud)),
        state: this.getProjectState(),
      };
    }

    if (input.monitorBaud !== undefined && !supportedBaudRates.has(input.monitorBaud)) {
      return {
        success: false,
        operation: 'selectSerialPort',
        message: vscode.l10n.t('Unsupported monitor baud rate: {0}', String(input.monitorBaud)),
        state: this.getProjectState(),
      };
    }

    this.serialPortService.selectedSerialPort = port.path;
    if (input.downloadBaud !== undefined) {
      this.serialPortService.downloadBaudRate = input.downloadBaud;
    }
    if (input.monitorBaud !== undefined) {
      this.serialPortService.monitorBaudRate = input.monitorBaud;
    }
    this.statusBarProvider.updateStatusBarItems();

    return {
      success: true,
      operation: 'selectSerialPort',
      port,
      downloadBaudRate: this.serialPortService.downloadBaudRate,
      monitorBaudRate: this.serialPortService.monitorBaudRate,
      state: this.getProjectState(),
    };
  }

  public async openMonitor(input: { port?: string; monitorBaud?: number } = {}): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    if (input.port) {
      const selected = await this.selectSerialPort({
        port: input.port,
        monitorBaud: input.monitorBaud,
      });
      if (typeof selected === 'object' && selected && 'success' in selected && !selected.success) {
        return selected;
      }
    } else if (input.monitorBaud !== undefined) {
      const supportedBaudRates = new Set(SerialPortService.getBaudRates());
      if (!supportedBaudRates.has(input.monitorBaud)) {
        return {
          success: false,
          operation: 'openMonitor',
          message: vscode.l10n.t('Unsupported monitor baud rate: {0}', String(input.monitorBaud)),
          state: this.getProjectState(),
        };
      }
      this.serialPortService.monitorBaudRate = input.monitorBaud;
    }

    await this.serialMonitorService.initialize();
    const selectedPort = this.serialPortService.selectedSerialPort;
    if (!selectedPort) {
      return {
        success: false,
        operation: 'openMonitor',
        message: vscode.l10n.t('Select a serial port first. Click "COM: N/A" in the status bar.'),
        state: this.getProjectState(),
      };
    }

    const success = await this.serialMonitorService.openSerialMonitor(
      selectedPort,
      this.serialPortService.monitorBaudRate
    );
    this.statusBarProvider.updateStatusBarItems();

    return {
      success,
      operation: 'openMonitor',
      port: selectedPort,
      monitorBaudRate: this.serialPortService.monitorBaudRate,
      hostInteractionRequired: true,
      state: this.getProjectState(),
    };
  }

  public async closeMonitor(): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const success = await this.serialMonitorService.closeSerialMonitor();
    this.statusBarProvider.updateStatusBarItems();
    return {
      success,
      operation: 'closeMonitor',
      state: this.getProjectState(),
    };
  }

  public async compile(): Promise<unknown> {
    return this.runBuildOperation('compile', async runId =>
      this.buildExecutionService.executeCompileDetailed({
        waitForExit: true,
        showNotifications: false,
        runId,
      })
    );
  }

  public async rebuild(): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const cleanResult = this.buildExecutionService.executeCleanDetailed(false);
    if (!cleanResult.success) {
      return {
        success: false,
        operation: 'rebuild',
        message: cleanResult.message,
        state: this.getProjectState(),
      };
    }

    const runId = this.createRunId('rebuild');
    const result = await this.buildExecutionService.executeCompileDetailed({
      waitForExit: true,
      showNotifications: false,
      runId,
    });
    return this.buildOperationPayload(
      'rebuild',
      runId,
      result.success,
      result.exitCode,
      result.command,
      result.message
    );
  }

  public async clean(): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const result = this.buildExecutionService.executeCleanDetailed(false);
    return {
      success: result.success,
      operation: 'clean',
      message: result.message,
      state: this.getProjectState(),
    };
  }

  public async download(): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const monitorWasActive = this.serialMonitorService.hasActiveMonitor();
    if (monitorWasActive) {
      await this.serialMonitorService.closeSerialMonitor();
    }

    const runId = this.createRunId('download');
    const result = await this.buildExecutionService.executeDownloadDetailed({
      waitForExit: true,
      ensureBuildDirectory: true,
      promptBuildIfMissing: false,
      showNotifications: false,
      runId,
    });

    if (this.serialMonitorService.canResume()) {
      await this.serialMonitorService.resumeSerialMonitor();
    }

    return this.buildOperationPayload(
      'download',
      runId,
      result.success,
      result.exitCode,
      result.command,
      result.message,
      {
        resumedMonitor: monitorWasActive && this.serialMonitorService.hasActiveMonitor(),
      }
    );
  }

  public async menuconfig(): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const runId = this.createRunId('menuconfig');
    const result = await this.buildExecutionService.executeMenuconfigDetailed({
      waitForExit: false,
      showNotifications: false,
      runId,
    });
    return this.buildOperationPayload(
      'menuconfig',
      runId,
      result.success,
      result.exitCode,
      result.command,
      result.message,
      { hostInteractionRequired: true }
    );
  }

  public async listSdks(): Promise<unknown> {
    const sdks = await this.sdkService.discoverSiFliSdks();
    this.configService.detectedSdkVersions = sdks;
    return {
      success: true,
      operation: 'listSdks',
      sdks,
      currentSdkPath: this.configService.getCurrentSdkPath(),
      state: this.getProjectState(),
    };
  }

  public async addSdkPath(input: { sdkPath: string; toolsPath?: string; activate?: boolean }): Promise<unknown> {
    const result = await this.sdkService.addSdkPathDetailed(input.sdkPath, input.toolsPath);
    if (!result.success) {
      return {
        success: false,
        operation: 'addSdkPath',
        message: result.message,
        state: this.getProjectState(),
      };
    }

    let activationResult:
      | {
          success: boolean;
          sdk?: SdkVersion;
          scriptPath?: string;
          message?: string;
        }
      | undefined;
    if (input.activate) {
      activationResult = await this.sdkService.activateSdkDetailed({
        sdkPath: input.sdkPath,
        showNotifications: false,
      });
    }

    return {
      success: !activationResult || activationResult.success,
      operation: 'addSdkPath',
      message: activationResult?.message ?? result.message,
      activationResult,
      state: this.getProjectState(),
    };
  }

  public async removeSdkPath(input: { sdkPath: string }): Promise<unknown> {
    const result = await this.sdkService.removeSdkPathDetailed(input.sdkPath);
    return {
      success: result.success,
      operation: 'removeSdkPath',
      message: result.message,
      state: this.getProjectState(),
    };
  }

  public async activateSdk(input: { sdkPath?: string; version?: string }): Promise<unknown> {
    const result = await this.sdkService.activateSdkDetailed({
      sdkPath: input.sdkPath,
      version: input.version,
      showNotifications: false,
    });
    return {
      success: result.success,
      operation: 'activateSdk',
      sdk: result.sdk,
      scriptPath: result.scriptPath,
      message: result.message,
      state: this.getProjectState(),
    };
  }

  public async setSdkToolsPath(input: { sdkPath: string; toolsPath: string }): Promise<unknown> {
    const result = await this.sdkService.setSdkToolsPathDetailed(input.sdkPath, input.toolsPath);
    return {
      success: result.success,
      operation: 'setSdkToolsPath',
      message: result.message,
      state: this.getProjectState(),
    };
  }

  public async fetchSdkReleases(input: { source: 'github' | 'gitee' }): Promise<unknown> {
    try {
      const releases = await this.gitService.fetchSiFliSdkReleases(input.source);
      return {
        success: true,
        operation: 'fetchSdkReleases',
        source: input.source,
        releases,
      };
    } catch (error) {
      return {
        success: false,
        operation: 'fetchSdkReleases',
        source: input.source,
        message: String(error),
      };
    }
  }

  public async fetchSdkBranches(input: { source: 'github' | 'gitee' }): Promise<unknown> {
    try {
      const branches = await this.gitService.fetchSiFliSdkBranches(input.source);
      return {
        success: true,
        operation: 'fetchSdkBranches',
        source: input.source,
        branches,
      };
    } catch (error) {
      return {
        success: false,
        operation: 'fetchSdkBranches',
        source: input.source,
        message: String(error),
      };
    }
  }

  public async listProjectTemplates(input: { sdkPath?: string; sdkVersion?: string } = {}): Promise<unknown> {
    const templates = await this.projectCreationService.listProjectTemplates(input);
    return {
      success: true,
      operation: 'listProjectTemplates',
      templates: templates.map(template => ({
        sdkPath: template.sdkPath,
        sdkVersion: template.sdkVersion,
        exampleId: template.exampleId,
        relativeExamplePath: template.relativeExamplePath,
        displayName: template.displayName,
      })),
    };
  }

  public async createProjectFromExample(input: CreateProjectFromTemplateOptions): Promise<unknown> {
    const result = await this.projectCreationService.createProjectFromTemplate(input);
    return {
      operation: 'createProjectFromExample',
      ...result,
    };
  }

  public async configureClangd(input: { boardName?: string } = {}): Promise<unknown> {
    const result = await this.clangdService.configure(input.boardName);
    return {
      operation: 'configureClangd',
      ...result,
      state: this.getProjectState(),
    };
  }

  private async runBuildOperation(
    operation: string,
    executor: (runId: string) => Promise<{
      success: boolean;
      exitCode?: number;
      command?: string;
      message?: string;
    }>
  ): Promise<unknown> {
    const project = this.ensureSiFliProject();
    if (!project.ok) {
      return project.payload;
    }

    const runId = this.createRunId(operation);
    const result = await executor(runId);
    return this.buildOperationPayload(
      operation,
      runId,
      result.success,
      result.exitCode,
      result.command,
      result.message
    );
  }

  private describeWorkflow(workflowRef: WorkflowReference | string): unknown {
    const scopedWorkflow = this.workflowService.getWorkflowByReference(workflowRef);
    if (!scopedWorkflow) {
      return undefined;
    }

    const compatibility = this.workflowService.getWorkflowToolCompatibility(scopedWorkflow.workflowRef);
    const inputs = Array.isArray(scopedWorkflow.workflow.inputs)
      ? scopedWorkflow.workflow.inputs.map(input => ({
          key: input.key,
          prompt: input.prompt,
          placeHolder: input.placeHolder,
          defaultValue: input.defaultValue,
          required: !!input.required,
          password: !!input.password,
        }))
      : [];

    return {
      workflowRef: scopedWorkflow.workflowRef,
      scope: scopedWorkflow.scope,
      id: scopedWorkflow.workflow.id,
      name: scopedWorkflow.workflow.name,
      description: scopedWorkflow.workflow.description,
      stepCount: Array.isArray(scopedWorkflow.workflow.steps) ? scopedWorkflow.workflow.steps.length : 0,
      stepTypes: Array.isArray(scopedWorkflow.workflow.steps)
        ? scopedWorkflow.workflow.steps.map(step => step.type)
        : [],
      inputs,
      hasShellCommand: compatibility.hasShellCommand,
      runnableByTool: compatibility.runnable,
      notRunnableReasons: compatibility.reasons,
    };
  }

  private validateWorkflowDefinition(workflow: WorkflowDefinition): WorkflowValidationIssue[] {
    const issues: WorkflowValidationIssue[] = [];
    const allowedSteps = new Set(this.workflowService.getBuiltInStepTypes());

    if (!workflow.id || !workflow.id.trim()) {
      issues.push({
        code: 'workflow.id.empty',
        path: 'workflow.id',
        message: 'Workflow id must be a non-empty string.',
      });
    }

    if (!workflow.name || !workflow.name.trim()) {
      issues.push({
        code: 'workflow.name.empty',
        path: 'workflow.name',
        message: 'Workflow name must be a non-empty string.',
      });
    }

    if (workflow.failurePolicy && workflow.failurePolicy !== 'stop' && workflow.failurePolicy !== 'continue') {
      issues.push({
        code: 'workflow.failurePolicy.invalid',
        path: 'workflow.failurePolicy',
        message: 'Workflow failure policy must be "stop" or "continue".',
      });
    }

    if (workflow.inputs && !Array.isArray(workflow.inputs)) {
      issues.push({
        code: 'workflow.inputs.invalid',
        path: 'workflow.inputs',
        message: 'Workflow inputs must be an array.',
      });
    }

    const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
    steps.forEach((step, index) => {
      if (!allowedSteps.has(step.type)) {
        issues.push({
          code: 'workflow.step.unsupported',
          path: `workflow.steps[${index}].type`,
          message: `Unsupported step type "${step.type}".`,
        });
      }

      if (step.type === 'shell.command') {
        const command = typeof step.args?.command === 'string' ? step.args.command.trim() : '';
        if (!command) {
          issues.push({
            code: 'workflow.step.shell.command.empty',
            path: `workflow.steps[${index}].args.command`,
            message: 'shell.command step requires args.command.',
          });
        }
      }
    });

    return issues;
  }

  private validateStatusBarButton(button: WorkflowStatusBarButton): string | undefined {
    if (!button.id || !button.id.trim()) {
      return 'Status bar button id must be a non-empty string.';
    }
    if (!button.text || !button.text.trim()) {
      return 'Status bar button text must be a non-empty string.';
    }
    if (!button.action || (button.action.kind !== 'workflow' && button.action.kind !== 'command')) {
      return 'Status bar button action.kind must be "workflow" or "command".';
    }
    if (button.action.kind === 'workflow') {
      if (!button.action.workflowId) {
        return 'Status bar workflow action requires workflowId.';
      }
      const workflow = this.workflowService.getResolvedWorkflows().find(item => item.id === button.action.workflowId);
      if (!workflow) {
        return `workflowId "${button.action.workflowId}" does not exist.`;
      }
    }
    if (button.action.kind === 'command' && !button.action.commandId) {
      return 'Status bar command action requires commandId.';
    }
    return undefined;
  }

  private configurationTargetFromScope(scope: WorkflowScope): vscode.ConfigurationTarget {
    return scope === 'user' ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;
  }

  private getEditableWorkflows(target: vscode.ConfigurationTarget): WorkflowDefinition[] {
    const inspect = vscode.workspace.getConfiguration('sifli-sdk-codekit').inspect<WorkflowDefinition[]>('workflows');
    const source = target === vscode.ConfigurationTarget.Global ? inspect?.globalValue : inspect?.workspaceValue;
    return Array.isArray(source) ? source.map(item => this.cloneWorkflow(item)) : [];
  }

  private getEditableButtons(target: vscode.ConfigurationTarget): WorkflowStatusBarButton[] {
    const inspect = vscode.workspace
      .getConfiguration('sifli-sdk-codekit')
      .inspect<WorkflowStatusBarButton[]>('statusBar.buttons');
    const source = target === vscode.ConfigurationTarget.Global ? inspect?.globalValue : inspect?.workspaceValue;
    return Array.isArray(source) ? source.map(item => this.cloneStatusBarButton(item)) : [];
  }

  private getEditableWorkflowByReference(workflowRef: string): {
    target: vscode.ConfigurationTarget;
    workflows: WorkflowDefinition[];
    workflow: WorkflowDefinition;
  } | null {
    const parsed = this.workflowService.parseWorkflowReference(workflowRef);
    if (!parsed) {
      return null;
    }

    const target = this.configurationTargetFromScope(parsed.scope);
    const workflows = this.getEditableWorkflows(target);
    const workflow = workflows.find(item => item.id === parsed.workflowId);
    if (!workflow) {
      return null;
    }
    return {
      target,
      workflows,
      workflow,
    };
  }

  private cloneWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
    return {
      ...workflow,
      inputs: Array.isArray(workflow.inputs) ? workflow.inputs.map(input => ({ ...input })) : [],
      steps: Array.isArray(workflow.steps)
        ? workflow.steps.map(step => ({
            ...step,
            runIf: step.runIf ? { ...step.runIf } : undefined,
            args: step.args ? { ...step.args } : undefined,
          }))
        : [],
    };
  }

  private cloneStatusBarButton(button: WorkflowStatusBarButton): WorkflowStatusBarButton {
    return {
      ...button,
      action: { ...button.action },
    };
  }

  private ensureSiFliProject(): { ok: true } | { ok: false; payload: unknown } {
    if (isSiFliProject()) {
      return { ok: true };
    }
    return {
      ok: false,
      payload: {
        success: false,
        message: vscode.l10n.t('Language model tools are only available in a SiFli project.'),
        state: this.getProjectState(),
      },
    };
  }

  private buildOperationPayload(
    operation: string,
    runId: string,
    success: boolean,
    exitCode?: number,
    command?: string,
    message?: string,
    extras?: Record<string, unknown>
  ): unknown {
    return {
      success,
      operation,
      runId,
      terminalName: TERMINAL_NAME,
      exitCode,
      command,
      message,
      state: this.getProjectState(),
      ...extras,
    };
  }

  private createRunId(prefix: string): string {
    const runId = `${prefix}-${randomUUID()}`;
    this.logService.info(`Created automation run id: ${runId}`);
    return runId;
  }
}
