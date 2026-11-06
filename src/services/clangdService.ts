import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from './configService';
import { LogService } from './logService';
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
  /** 本次是否实际修改了 clangd.arguments 或 .clangd；未修改时无需重启 clangd */
  changed?: boolean;
};

const CLANGD_EXTENSION_ID = 'llvm-vs-code-extensions.vscode-clangd';

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

  /**
   * 编译成功后自动配置 clangd。
   *
   * clangd 只会在源文件的上级目录里查找 compile_commands.json，找不到 SiFli 工程
   * project/build_<board>_hcpu/ 下的数据库；以前需要用户手动点“配置 clangd”，
   * 不点就会退回 fallback 编译参数，报 rtthread.h 找不到。这里在每次编译成功后
   * 检查配置，有变化才写入并重启 clangd，没有变化则什么都不做。
   * 切换开发板后再编译，也会自动指向新板子的构建目录。
   */
  public async autoConfigureAfterBuild(boardName?: string): Promise<void> {
    const logService = LogService.getInstance();
    try {
      const enabled = vscode.workspace
        .getConfiguration('sifli-sdk-codekit')
        .get<boolean>('clangd.autoConfigureAfterBuild', true);
      if (!enabled) {
        return;
      }

      const selectedBoard = boardName ?? this.configService.getSelectedBoardName();
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!selectedBoard || selectedBoard === 'N/A' || !workspaceFolder) {
        return;
      }

      // 没有生成数据库时不写配置，避免把 clangd 指向一个空目录
      const compileCommandsFile = path.join(
        workspaceFolder.uri.fsPath,
        ...this.getBuildFolderRelativePath(selectedBoard).split('/'),
        'compile_commands.json'
      );
      if (!fs.existsSync(compileCommandsFile)) {
        logService.info(`[clangd] Skip auto configuration: ${compileCommandsFile} not found.`);
        return;
      }

      const result = await this.configure(selectedBoard);
      if (!result.success) {
        logService.warn(`[clangd] Auto configuration failed: ${result.message ?? 'unknown error'}`);
        return;
      }
      if (result.warnings && result.warnings.length > 0) {
        logService.warn(`[clangd] Auto configuration warnings: ${result.warnings.join('; ')}`);
      }
      if (!result.changed) {
        return;
      }

      logService.info(`[clangd] Auto configured clangd for board ${selectedBoard}, restarting clangd.`);
      if (vscode.extensions.getExtension(CLANGD_EXTENSION_ID)) {
        try {
          await vscode.commands.executeCommand('clangd.restart');
        } catch (error) {
          logService.warn('[clangd] clangd.restart failed after auto configuration:', error);
        }
      }
      void vscode.window.showInformationMessage(
        vscode.l10n.t('clangd was configured automatically for board {0}.', selectedBoard)
      );
    } catch (error) {
      logService.error('[clangd] Auto configuration after build failed:', error);
    }
  }

  private getBuildFolderRelativePath(selectedBoard: string): string {
    const projectInfo = getProjectInfo();
    const projectRelativePath = projectInfo?.projectEntryRelativePath || 'project';
    const projectRelativePathForClangd = projectRelativePath.split(path.sep).join('/');
    return `${projectRelativePathForClangd}/build_${selectedBoard}_hcpu`;
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

    const buildFolderRelativePath = this.getBuildFolderRelativePath(selectedBoard);
    const compileCommandsDir = `\${workspaceFolder}/${buildFolderRelativePath}`;
    const toolchain = this.resolveToolchain();
    const clangdConfig = vscode.workspace.getConfiguration('clangd', workspaceFolder.uri);
    const existingArguments = await this.readExistingClangdArguments(workspaceFolder.uri.fsPath, clangdConfig);
    const nextArguments = buildClangdArguments({
      existingArguments,
      compileCommandsDir,
      queryDriver: toolchain.queryDriver,
    });

    const argumentsChanged = JSON.stringify(existingArguments) !== JSON.stringify(nextArguments);
    if (argumentsChanged) {
      await this.writeClangdArguments(workspaceFolder.uri.fsPath, clangdConfig, nextArguments);
    }
    const { clangdConfigPath, changed: clangdConfigChanged } = await this.writeClangdConfig(
      workspaceFolder.uri.fsPath,
      buildFolderRelativePath,
      toolchain.compilerPaths
    );

    const warnings = [...toolchain.warnings];
    const compileCommandsFile = path.join(
      workspaceFolder.uri.fsPath,
      ...buildFolderRelativePath.split('/'),
      'compile_commands.json'
    );
    if (!fs.existsSync(compileCommandsFile)) {
      warnings.push(
        vscode.l10n.t(
          'compile_commands.json was not found at {0}. Build the project first, then restart clangd.',
          compileCommandsFile
        )
      );
    }

    return {
      success: true,
      selectedBoard,
      compileCommandsDir,
      clangdConfigPath,
      queryDriver: toolchain.queryDriver,
      compilerPaths: toolchain.compilerPaths,
      warnings,
      changed: argumentsChanged || clangdConfigChanged,
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
  ): Promise<{ clangdConfigPath: string; changed: boolean }> {
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
    if (nextContent === existingContent) {
      return { clangdConfigPath, changed: false };
    }
    await fs.promises.writeFile(clangdConfigPath, nextContent, 'utf8');
    return { clangdConfigPath, changed: true };
  }
}
