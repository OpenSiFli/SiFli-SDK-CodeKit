import * as vscode from 'vscode';
import { ConfigService } from './configService';
import { getProjectInfo } from '../utils/projectUtils';

export type ClangdConfigurationResult = {
  success: boolean;
  selectedBoard?: string;
  compileCommandsDir?: string;
  message?: string;
};

export class ClangdService {
  private static instance: ClangdService;
  private readonly configService: ConfigService;

  private constructor() {
    this.configService = ConfigService.getInstance();
  }

  public static getInstance(): ClangdService {
    if (!ClangdService.instance) {
      ClangdService.instance = new ClangdService();
    }
    return ClangdService.instance;
  }

  public async configure(boardName?: string): Promise<ClangdConfigurationResult> {
    const selectedBoard = boardName ?? this.configService.getSelectedBoardName();
    if (!selectedBoard || selectedBoard === 'N/A') {
      return {
        success: false,
        message: vscode.l10n.t('Select a board first.'),
      };
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return {
        success: false,
        message: vscode.l10n.t('No workspace folder found.'),
      };
    }

    const projectInfo = getProjectInfo();
    const projectRelativePath = projectInfo?.projectEntryRelativePath || 'project';
    const compileCommandsDir = `\${workspaceFolder}/${projectRelativePath}/build_${selectedBoard}_hcpu`;
    const clangdConfig = vscode.workspace.getConfiguration('clangd', workspaceFolder.uri);
    const existingArguments = clangdConfig.get<unknown>('arguments');
    const preservedArguments = Array.isArray(existingArguments)
      ? existingArguments.filter((value): value is string => typeof value === 'string')
      : [];
    const nextArguments = [
      ...preservedArguments.filter(argument => !argument.startsWith('--compile-commands-dir=')),
      `--compile-commands-dir=${compileCommandsDir}`,
    ];

    await clangdConfig.update('arguments', nextArguments, vscode.ConfigurationTarget.Workspace);

    return {
      success: true,
      selectedBoard,
      compileCommandsDir,
      message: vscode.l10n.t('clangd configuration completed for board {0}.', selectedBoard),
    };
  }
}
