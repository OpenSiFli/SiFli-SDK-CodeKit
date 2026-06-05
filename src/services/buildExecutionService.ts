import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TASK_NAMES } from '../constants';
import { BoardService } from './boardService';
import { BuildTaskService } from './buildTaskService';
import { ConfigService } from './configService';
import { SerialPortService } from './serialPortService';
import { TerminalService } from './terminalService';

export type TemplateValues = Record<string, string>;

export type DownloadExecutionOptions = {
  templateValues?: TemplateValues;
  waitForExit?: boolean;
  ensureBuildDirectory?: boolean;
  promptBuildIfMissing?: boolean;
  showNotifications?: boolean;
  runId?: string;
};

export type BuildTaskExecutionResult = {
  success: boolean;
  taskName: string;
  exitCode?: number;
  command?: string;
  background?: boolean;
  runId?: string;
  message?: string;
};

export class BuildExecutionService {
  private static instance: BuildExecutionService;
  public static readonly COMPILE_EXIT_TIMEOUT_MS = 60 * 60 * 1000;

  private configService: ConfigService;
  private boardService: BoardService;
  private serialPortService: SerialPortService;
  private terminalService: TerminalService;
  private buildTaskService: BuildTaskService;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.boardService = BoardService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
    this.terminalService = TerminalService.getInstance();
    this.buildTaskService = BuildTaskService.getInstance();
  }

  public static getInstance(): BuildExecutionService {
    if (!BuildExecutionService.instance) {
      BuildExecutionService.instance = new BuildExecutionService();
    }
    return BuildExecutionService.instance;
  }

  public async executeCompile(options?: {
    templateValues?: TemplateValues;
    waitForExit?: boolean;
    showNotifications?: boolean;
    runId?: string;
    timeoutMs?: number;
  }): Promise<boolean> {
    const result = await this.executeCompileDetailed(options);
    return result.success;
  }

  public async executeCompileDetailed(options?: {
    templateValues?: TemplateValues;
    waitForExit?: boolean;
    showNotifications?: boolean;
    runId?: string;
    timeoutMs?: number;
  }): Promise<BuildTaskExecutionResult> {
    const showNotifications = options?.showNotifications ?? true;
    const selectedBoardName = this.getSelectedBoardNameOrWarn(showNotifications);
    if (!selectedBoardName) {
      return {
        success: false,
        taskName: TASK_NAMES.BUILD,
        runId: options?.runId,
        message: vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.'),
      };
    }

    const waitForExit = options?.waitForExit ?? true;
    const templateValues = options?.templateValues ?? {};
    const numThreads = this.configService.getNumThreads();
    let command = await this.boardService.getCompileCommand(selectedBoardName, numThreads);
    command = this.resolveTemplate(command, templateValues);
    const taskResult = await this.buildTaskService.runShellTask({
      taskName: TASK_NAMES.BUILD,
      title: TASK_NAMES.BUILD,
      commandLine: command,
      waitForExit,
      runId: options?.runId,
      timeoutMs: options?.timeoutMs,
    });
    const exitCode = taskResult.exitCode;
    return {
      success: exitCode === undefined || exitCode === 0,
      taskName: TASK_NAMES.BUILD,
      exitCode,
      command,
      background: taskResult.background,
      runId: options?.runId,
    };
  }

  public executeClean(): boolean {
    return this.executeCleanDetailed().success;
  }

  public executeCleanDetailed(showNotifications = true): BuildTaskExecutionResult {
    const selectedBoardName = this.getSelectedBoardNameOrWarn(showNotifications);
    if (!selectedBoardName) {
      return {
        success: false,
        taskName: TASK_NAMES.CLEAN,
        message: vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.'),
      };
    }

    const workspaceFolder = this.getWorkspaceFolderOrError(showNotifications);
    if (!workspaceFolder) {
      return {
        success: false,
        taskName: TASK_NAMES.CLEAN,
        message: vscode.l10n.t('No workspace folder is open.'),
      };
    }

    const buildFolder = this.boardService.getBuildTargetFolder(selectedBoardName);
    const buildPath = path.join(workspaceFolder.uri.fsPath, buildFolder);
    if (!fs.existsSync(buildPath)) {
      const message = vscode.l10n.t('Build directory does not exist. No cleanup needed: {0}', buildFolder);
      this.buildTaskService.recordInstantTaskSync(TASK_NAMES.CLEAN, TASK_NAMES.CLEAN, log => {
        log(message);
      });
      if (showNotifications) {
        vscode.window.showInformationMessage(message);
      }
      return {
        success: true,
        taskName: TASK_NAMES.CLEAN,
        message,
      };
    }

    const cleanMessage = vscode.l10n.t('Build directory cleaned: {0}', buildFolder);
    const task = this.buildTaskService.recordInstantTaskSync(TASK_NAMES.CLEAN, TASK_NAMES.CLEAN, log => {
      log(vscode.l10n.t('Cleaning build directory: {0}', buildPath));
      fs.rmSync(buildPath, { recursive: true, force: true });
      log(cleanMessage);
    });
    if (showNotifications) {
      vscode.window.showInformationMessage(cleanMessage);
    }
    return {
      success: task.status === 'succeeded',
      taskName: TASK_NAMES.CLEAN,
      exitCode: task.exitCode,
      message: task.error ?? cleanMessage,
    };
  }

  public async executeDownload(options?: DownloadExecutionOptions): Promise<boolean> {
    const result = await this.executeDownloadDetailed(options);
    return result.success;
  }

  public async executeDownloadDetailed(options?: DownloadExecutionOptions): Promise<BuildTaskExecutionResult> {
    const showNotifications = options?.showNotifications ?? true;
    const selectedBoardName = this.getSelectedBoardNameOrWarn(showNotifications);
    if (!selectedBoardName) {
      return {
        success: false,
        taskName: TASK_NAMES.DOWNLOAD,
        runId: options?.runId,
        message: vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.'),
      };
    }
    const selectedSerialPort = this.serialPortService.selectedSerialPort;
    if (!selectedSerialPort) {
      if (showNotifications) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('Select a download serial port first. Click the plug item in the status bar.')
        );
      }
      return {
        success: false,
        taskName: TASK_NAMES.DOWNLOAD,
        runId: options?.runId,
        message: vscode.l10n.t('Select a download serial port first. Click the plug item in the status bar.'),
      };
    }

    if (options?.ensureBuildDirectory) {
      const buildReady = await this.ensureBuildDirectory(
        selectedBoardName,
        options.promptBuildIfMissing,
        showNotifications,
        options?.runId
      );
      if (!buildReady) {
        return {
          success: false,
          taskName: TASK_NAMES.DOWNLOAD,
          runId: options?.runId,
          message: vscode.l10n.t(
            'Build directory does not exist: {0}. Build first?',
            this.boardService.getBuildTargetFolder(selectedBoardName)
          ),
        };
      }
    }

    const templateValues = options?.templateValues ?? {};
    const waitForExit = options?.waitForExit ?? true;
    let command = await this.boardService.getSftoolDownloadCommand(
      selectedBoardName,
      selectedSerialPort,
      this.serialPortService.downloadBaudRate
    );
    command = this.resolveTemplate(command, templateValues);
    const taskResult = await this.buildTaskService.runShellTask({
      taskName: TASK_NAMES.DOWNLOAD,
      title: TASK_NAMES.DOWNLOAD,
      commandLine: command,
      waitForExit,
      runId: options?.runId,
    });
    const exitCode = taskResult.exitCode;
    return {
      success: exitCode === undefined || exitCode === 0,
      taskName: TASK_NAMES.DOWNLOAD,
      exitCode,
      command,
      background: taskResult.background,
      runId: options?.runId,
    };
  }

  public async executeMenuconfig(options?: {
    templateValues?: TemplateValues;
    waitForExit?: boolean;
    showNotifications?: boolean;
    runId?: string;
  }): Promise<boolean> {
    const result = await this.executeMenuconfigDetailed(options);
    return result.success;
  }

  public async executeMenuconfigDetailed(options?: {
    templateValues?: TemplateValues;
    waitForExit?: boolean;
    showNotifications?: boolean;
    runId?: string;
  }): Promise<BuildTaskExecutionResult> {
    const showNotifications = options?.showNotifications ?? true;
    const selectedBoardName = this.getSelectedBoardNameOrWarn(showNotifications);
    if (!selectedBoardName) {
      return {
        success: false,
        taskName: TASK_NAMES.MENUCONFIG,
        runId: options?.runId,
        message: vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.'),
      };
    }

    const templateValues = options?.templateValues ?? {};
    let command = await this.boardService.getMenuconfigCommand(selectedBoardName);
    command = this.resolveTemplate(command, templateValues);
    const terminal = await this.terminalService.getOrCreateSiFliTerminalAndCdProject(true);
    terminal.show();
    terminal.sendText(command);
    return {
      success: true,
      taskName: TASK_NAMES.MENUCONFIG,
      command,
      background: true,
      runId: options?.runId,
      message: vscode.l10n.t('Menuconfig opened in a dedicated SiFli terminal.'),
    };
  }

  public async executeGenerateCodebaseIndex(options?: {
    waitForExit?: boolean;
    showNotifications?: boolean;
    runId?: string;
  }): Promise<boolean> {
    const result = await this.executeGenerateCodebaseIndexDetailed(options);
    return result.success;
  }

  public async executeGenerateCodebaseIndexDetailed(options?: {
    waitForExit?: boolean;
    showNotifications?: boolean;
    runId?: string;
  }): Promise<BuildTaskExecutionResult> {
    const showNotifications = options?.showNotifications ?? true;
    const selectedBoardName = this.getSelectedBoardNameOrWarn(showNotifications);
    if (!selectedBoardName) {
      return {
        success: false,
        taskName: TASK_NAMES.GENERATE_CODEBASE_INDEX,
        runId: options?.runId,
        message: vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.'),
      };
    }

    const waitForExit = options?.waitForExit ?? true;
    const command = await this.boardService.getGenerateCodebaseIndexCommand(selectedBoardName);
    const taskResult = await this.buildTaskService.runShellTask({
      taskName: TASK_NAMES.GENERATE_CODEBASE_INDEX,
      title: TASK_NAMES.GENERATE_CODEBASE_INDEX,
      commandLine: command,
      waitForExit,
      runId: options?.runId,
    });
    const exitCode = taskResult.exitCode;

    return {
      success: exitCode === undefined || exitCode === 0,
      taskName: TASK_NAMES.GENERATE_CODEBASE_INDEX,
      exitCode,
      command,
      background: taskResult.background,
      runId: options?.runId,
    };
  }

  private getSelectedBoardNameOrWarn(showNotification = true): string | undefined {
    const selectedBoardName = this.configService.getSelectedBoardName();
    if (!selectedBoardName || selectedBoardName === 'N/A') {
      if (showNotification) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.')
        );
      }
      return undefined;
    }
    return selectedBoardName;
  }

  private getWorkspaceFolderOrError(showNotification = true): vscode.WorkspaceFolder | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      if (showNotification) {
        vscode.window.showErrorMessage(vscode.l10n.t('No workspace folder is open.'));
      }
      return undefined;
    }
    return workspaceFolder;
  }

  private async ensureBuildDirectory(
    selectedBoardName: string,
    promptBuildIfMissing = false,
    showNotifications = true,
    runId?: string
  ): Promise<boolean> {
    const workspaceFolder = this.getWorkspaceFolderOrError(showNotifications);
    if (!workspaceFolder) {
      return false;
    }

    const buildFolder = this.boardService.getBuildTargetFolder(selectedBoardName);
    const buildPath = path.join(workspaceFolder.uri.fsPath, buildFolder);
    if (fs.existsSync(buildPath)) {
      return true;
    }
    if (!promptBuildIfMissing) {
      return false;
    }

    const buildAction = vscode.l10n.t('Build');
    const cancelAction = vscode.l10n.t('Cancel');
    const response = await vscode.window.showWarningMessage(
      vscode.l10n.t('Build directory does not exist: {0}. Build first?', buildFolder),
      buildAction,
      cancelAction
    );
    if (response !== buildAction) {
      return false;
    }

    return this.executeCompile({
      waitForExit: true,
      showNotifications,
      runId,
    });
  }

  private resolveTemplate(input: string, values: TemplateValues): string {
    return input.replace(/\$\{input:([^}]+)\}/g, (_, key) => values[key] ?? '');
  }
}
