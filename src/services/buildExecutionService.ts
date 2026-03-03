import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TASK_NAMES } from '../constants';
import { BoardService } from './boardService';
import { ConfigService } from './configService';
import { SerialPortService } from './serialPortService';
import { TerminalService } from './terminalService';

export type TemplateValues = Record<string, string>;

export type DownloadExecutionOptions = {
  templateValues?: TemplateValues;
  waitForExit?: boolean;
  ensureBuildDirectory?: boolean;
  promptBuildIfMissing?: boolean;
};

export class BuildExecutionService {
  private static instance: BuildExecutionService;

  private configService: ConfigService;
  private boardService: BoardService;
  private serialPortService: SerialPortService;
  private terminalService: TerminalService;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.boardService = BoardService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
    this.terminalService = TerminalService.getInstance();
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
  }): Promise<boolean> {
    const selectedBoardName = this.getSelectedBoardNameOrWarn();
    if (!selectedBoardName) {
      return false;
    }

    const waitForExit = options?.waitForExit ?? true;
    const templateValues = options?.templateValues ?? {};
    const numThreads = this.configService.getNumThreads();
    let command = await this.boardService.getCompileCommand(selectedBoardName, numThreads);
    command = this.resolveTemplate(command, templateValues);
    const exitCode = await this.terminalService.executeShellCommandInSiFliTerminal(command, TASK_NAMES.BUILD, {
      waitForExit
    });
    return exitCode === undefined || exitCode === 0;
  }

  public executeClean(): boolean {
    const selectedBoardName = this.getSelectedBoardNameOrWarn();
    if (!selectedBoardName) {
      return false;
    }

    const workspaceFolder = this.getWorkspaceFolderOrError();
    if (!workspaceFolder) {
      return false;
    }

    const buildFolder = this.boardService.getBuildTargetFolder(selectedBoardName);
    const buildPath = path.join(workspaceFolder.uri.fsPath, buildFolder);
    if (!fs.existsSync(buildPath)) {
      vscode.window.showInformationMessage(vscode.l10n.t('Build directory does not exist. No cleanup needed: {0}', buildFolder));
      return true;
    }

    fs.rmSync(buildPath, { recursive: true, force: true });
    vscode.window.showInformationMessage(vscode.l10n.t('Build directory cleaned: {0}', buildFolder));
    return true;
  }

  public async executeDownload(options?: DownloadExecutionOptions): Promise<boolean> {
    const selectedBoardName = this.getSelectedBoardNameOrWarn();
    if (!selectedBoardName) {
      return false;
    }
    const selectedSerialPort = this.serialPortService.selectedSerialPort;
    if (!selectedSerialPort) {
      vscode.window.showWarningMessage(vscode.l10n.t('Select a serial port first. Click "COM: N/A" in the status bar.'));
      return false;
    }

    if (options?.ensureBuildDirectory) {
      const buildReady = await this.ensureBuildDirectory(selectedBoardName, options.promptBuildIfMissing);
      if (!buildReady) {
        return false;
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
    const exitCode = await this.terminalService.executeShellCommandInSiFliTerminal(command, TASK_NAMES.DOWNLOAD, {
      waitForExit
    });
    return exitCode === undefined || exitCode === 0;
  }

  public async executeMenuconfig(options?: {
    templateValues?: TemplateValues;
    waitForExit?: boolean;
  }): Promise<boolean> {
    const selectedBoardName = this.getSelectedBoardNameOrWarn();
    if (!selectedBoardName) {
      return false;
    }

    const templateValues = options?.templateValues ?? {};
    const waitForExit = options?.waitForExit ?? false;
    let command = await this.boardService.getMenuconfigCommand(selectedBoardName);
    command = this.resolveTemplate(command, templateValues);
    const exitCode = await this.terminalService.executeShellCommandInSiFliTerminal(command, TASK_NAMES.MENUCONFIG, {
      waitForExit
    });
    return exitCode === undefined || exitCode === 0;
  }

  private getSelectedBoardNameOrWarn(): string | undefined {
    const selectedBoardName = this.configService.getSelectedBoardName();
    if (!selectedBoardName || selectedBoardName === 'N/A') {
      vscode.window.showWarningMessage(vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.'));
      return undefined;
    }
    return selectedBoardName;
  }

  private getWorkspaceFolderOrError(): vscode.WorkspaceFolder | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(vscode.l10n.t('No workspace folder is open.'));
      return undefined;
    }
    return workspaceFolder;
  }

  private async ensureBuildDirectory(selectedBoardName: string, promptBuildIfMissing = false): Promise<boolean> {
    const workspaceFolder = this.getWorkspaceFolderOrError();
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

    return this.executeCompile({ waitForExit: true });
  }

  private resolveTemplate(input: string, values: TemplateValues): string {
    return input.replace(/\$\{input:([^}]+)\}/g, (_, key) => values[key] ?? '');
  }
}
