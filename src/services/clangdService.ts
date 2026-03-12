import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConfigService } from './configService';
import { getProjectInfo } from '../utils/projectUtils';

export type ClangdConfigurationResult = {
  success: boolean;
  settingsPath?: string;
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

  public configure(boardName?: string): ClangdConfigurationResult {
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

    const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
    const settingsPath = path.join(vscodeDir, 'settings.json');
    if (!fs.existsSync(vscodeDir)) {
      fs.mkdirSync(vscodeDir, { recursive: true });
    }

    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      try {
        settings = JSON.parse(content) as Record<string, unknown>;
      } catch {
        settings = {};
      }
    }

    const projectInfo = getProjectInfo();
    const projectRelativePath = projectInfo?.projectEntryRelativePath || 'project';
    const compileCommandsDir = `\${workspaceFolder}/${projectRelativePath}/build_${selectedBoard}_hcpu`;
    settings['clangd.arguments'] = [`--compile-commands-dir=${compileCommandsDir}`];
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), 'utf-8');

    return {
      success: true,
      settingsPath,
      selectedBoard,
      compileCommandsDir,
      message: vscode.l10n.t('clangd configuration completed for board {0}.', selectedBoard),
    };
  }
}
