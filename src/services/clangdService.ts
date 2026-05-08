import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from './configService';
import { getProjectInfo } from '../utils/projectUtils';
import {
  buildClangdArguments,
  buildCodeKitClangdConfigBlock,
  CompilerPaths,
  getDefaultSifliToolsRoot,
  readWorkspaceSettingJsonc,
  resolveToolchainFromSifliEnvState,
  upsertCodeKitClangdConfig,
  upsertWorkspaceSettingJsonc,
} from '../utils/clangdConfigUtils';

export type ClangdConfigurationResult = {
  success: boolean;
  selectedBoard?: string;
  compileCommandsDir?: string;
  clangdConfigPath?: string;
  queryDriver?: string;
  compilerPaths?: CompilerPaths;
  warnings?: string[];
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
    const projectRelativePathForClangd = projectRelativePath.split(path.sep).join('/');
    const buildFolderRelativePath = `${projectRelativePathForClangd}/build_${selectedBoard}_hcpu`;
    const compileCommandsDir = `\${workspaceFolder}/${buildFolderRelativePath}`;
    const toolchain = this.resolveToolchain();
    const clangdConfig = vscode.workspace.getConfiguration('clangd', workspaceFolder.uri);
    const existingArguments = await this.readExistingClangdArguments(workspaceFolder.uri.fsPath, clangdConfig);
    const nextArguments = buildClangdArguments({
      existingArguments,
      compileCommandsDir,
      queryDriver: toolchain.queryDriver,
    });

    await this.writeClangdArguments(workspaceFolder.uri.fsPath, clangdConfig, nextArguments);
    const clangdConfigPath = await this.writeClangdConfig(
      workspaceFolder.uri.fsPath,
      buildFolderRelativePath,
      toolchain.compilerPaths
    );

    return {
      success: true,
      selectedBoard,
      compileCommandsDir,
      clangdConfigPath,
      queryDriver: toolchain.queryDriver,
      compilerPaths: toolchain.compilerPaths,
      warnings: toolchain.warnings,
      message: vscode.l10n.t('clangd configuration completed for board {0}.', selectedBoard),
    };
  }

  private async readExistingClangdArguments(
    workspaceRoot: string,
    clangdConfig: vscode.WorkspaceConfiguration
  ): Promise<unknown> {
    const configuredArguments = clangdConfig.get<unknown>('arguments');
    if (Array.isArray(configuredArguments)) {
      return configuredArguments;
    }

    const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
    try {
      const existingContent = await fs.promises.readFile(settingsPath, 'utf8');
      return readWorkspaceSettingJsonc(existingContent, 'clangd.arguments') ?? configuredArguments;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return configuredArguments;
  }

  private async writeClangdArguments(
    workspaceRoot: string,
    clangdConfig: vscode.WorkspaceConfiguration,
    nextArguments: string[]
  ): Promise<void> {
    try {
      await clangdConfig.update('arguments', nextArguments, vscode.ConfigurationTarget.Workspace);
      return;
    } catch (error) {
      await this.writeWorkspaceSettingsClangdArguments(workspaceRoot, nextArguments);
    }
  }

  private async writeWorkspaceSettingsClangdArguments(workspaceRoot: string, nextArguments: string[]): Promise<void> {
    const vscodeFolderPath = path.join(workspaceRoot, '.vscode');
    const settingsPath = path.join(vscodeFolderPath, 'settings.json');
    let existingContent: string | undefined;

    try {
      existingContent = await fs.promises.readFile(settingsPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const nextContent = upsertWorkspaceSettingJsonc(existingContent, 'clangd.arguments', nextArguments);
    await fs.promises.mkdir(vscodeFolderPath, { recursive: true });
    await fs.promises.writeFile(settingsPath, nextContent, 'utf8');
  }

  private resolveToolchain(): { queryDriver?: string; compilerPaths: CompilerPaths; warnings: string[] } {
    const warnings: string[] = [];
    const currentSdkPath = this.configService.getCurrentSdkPath();
    if (!currentSdkPath) {
      return {
        compilerPaths: {},
        warnings: ['No active SiFli SDK path is configured.'],
      };
    }

    const toolsRoot = getDefaultSifliToolsRoot({
      configuredToolsPath: this.configService.getSdkToolsPath(currentSdkPath),
      envToolsPath: process.env.SIFLI_SDK_TOOLS_PATH,
    });
    const statePath = path.join(toolsRoot, 'sifli-sdk-env.json');
    if (!fs.existsSync(statePath)) {
      return {
        compilerPaths: {},
        warnings: [`SiFli SDK environment state was not found: ${statePath}.`],
      };
    }

    let stateDoc: unknown;
    try {
      stateDoc = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch (error) {
      return {
        compilerPaths: {},
        warnings: [`Failed to read SiFli SDK environment state ${statePath}: ${String(error)}.`],
      };
    }

    const resolution = resolveToolchainFromSifliEnvState({
      stateDoc,
      sdkPath: currentSdkPath,
      executableExists: fs.existsSync,
    });
    warnings.push(...resolution.warnings);

    return {
      queryDriver: resolution.queryDriver,
      compilerPaths: resolution.compilerPaths,
      warnings,
    };
  }

  private async writeClangdConfig(
    workspaceRoot: string,
    buildFolderRelativePath: string,
    compilerPaths: CompilerPaths
  ): Promise<string> {
    const clangdConfigPath = path.join(workspaceRoot, '.clangd');
    let existingContent: string | undefined;
    try {
      existingContent = await fs.promises.readFile(clangdConfigPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const block = buildCodeKitClangdConfigBlock({
      compilationDatabase: buildFolderRelativePath,
      compilerPaths,
    });
    const nextContent = upsertCodeKitClangdConfig(existingContent, block);
    await fs.promises.writeFile(clangdConfigPath, nextContent, 'utf8');
    return clangdConfigPath;
  }
}
