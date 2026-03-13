import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  GitSdkMetadata,
  ManagedSdkDetail,
  ManagedSdkSummary,
  SdkConfig,
  SdkTarget,
  SdkVersion,
  ToolchainSource,
} from '../types';
import { ConfigService } from './configService';
import { GitService } from './gitService';
import { TerminalService } from './terminalService';
import { LogService } from './logService';

const RELEASE_BRANCH_PREFIX = 'release/';

export class SdkService {
  private static instance: SdkService;
  private readonly configService: ConfigService;
  private readonly gitService: GitService;
  private readonly terminalService: TerminalService;
  private readonly logService: LogService;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.gitService = GitService.getInstance();
    this.terminalService = TerminalService.getInstance();
    this.logService = LogService.getInstance();
  }

  public static getInstance(): SdkService {
    if (!SdkService.instance) {
      SdkService.instance = new SdkService();
    }
    return SdkService.instance;
  }

  public async discoverSiFliSdks(autoRemoveInvalid = true): Promise<SdkVersion[]> {
    const managedSdks = await this.getManagedSdks(autoRemoveInvalid);
    const legacySdks = managedSdks.map(sdk => ({
      version: sdk.version,
      path: sdk.path,
      current: sdk.isCurrent,
      valid: sdk.valid,
    }));

    this.configService.detectedSdkVersions = legacySdks;
    return legacySdks;
  }

  public async getManagedSdks(autoRemoveInvalid = true): Promise<ManagedSdkSummary[]> {
    this.logService.info('Starting managed SDK discovery...');

    const sdkConfigs = this.configService.getSdkConfigs();
    const currentSdkPath = this.configService.getCurrentSdkPath();
    const sdkMap = new Map<string, SdkConfig>();
    const invalidPaths: string[] = [];

    for (const sdkConfig of sdkConfigs) {
      sdkMap.set(sdkConfig.path, sdkConfig);
    }

    if (currentSdkPath && !sdkMap.has(currentSdkPath)) {
      sdkMap.set(currentSdkPath, { path: currentSdkPath });
    }

    const sdks: ManagedSdkSummary[] = [];

    for (const sdkConfig of sdkMap.values()) {
      try {
        if (!fs.existsSync(sdkConfig.path)) {
          invalidPaths.push(sdkConfig.path);
          continue;
        }

        sdks.push(await this.buildManagedSdkSummary(sdkConfig, sdkConfig.path === currentSdkPath));
      } catch (error) {
        this.logService.error(`Failed to discover SDK at ${sdkConfig.path}`, error);
        invalidPaths.push(sdkConfig.path);
      }
    }

    if (autoRemoveInvalid && invalidPaths.length > 0) {
      for (const invalidPath of invalidPaths) {
        await this.configService.removeSdkConfig(invalidPath);
      }

      if (currentSdkPath && invalidPaths.includes(currentSdkPath)) {
        await this.configService.setCurrentSdkPath('');
      }
    }

    sdks.sort((left, right) => {
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    const legacySdks = sdks.map(sdk => ({
      version: sdk.version,
      path: sdk.path,
      current: sdk.isCurrent,
      valid: sdk.valid,
    }));
    this.configService.detectedSdkVersions = legacySdks;

    return sdks;
  }

  public async getManagedSdkDetail(sdkId: string): Promise<ManagedSdkDetail> {
    const sdkPath = this.decodeSdkId(sdkId);
    const sdkConfig = this.configService.getSdkConfig(sdkPath) || { path: sdkPath };
    const summary = await this.buildManagedSdkSummary(sdkConfig, sdkPath === this.configService.getCurrentSdkPath());
    const metadata = summary.isGitRepo ? await this.gitService.getSdkMetadata(sdkPath) : this.createNonGitMetadata();

    return {
      ...summary,
      origin: metadata.origin,
      trackedBranch: metadata.trackedBranch,
      hasInstallScript: !!this.getInstallScriptPath(sdkPath),
      hasExportScript: !!this.getActivationScriptForPlatform(sdkPath),
      hasVersionFile: fs.existsSync(path.join(sdkPath, 'version.txt')),
    };
  }

  public encodeSdkId(sdkPath: string): string {
    return Buffer.from(sdkPath, 'utf8').toString('base64url');
  }

  public decodeSdkId(sdkId: string): string {
    return Buffer.from(sdkId, 'base64url').toString('utf8');
  }

  public normalizeSdkTargets(
    rawTargets: Array<{ version: string; supported_chips: string[]; type?: 'branch' }>
  ): SdkTarget[] {
    return rawTargets.map(target => {
      if (target.type === 'branch') {
        const version = target.version === 'latest' ? 'main' : target.version;
        const branchRef = version === 'main' ? 'main' : `${RELEASE_BRANCH_PREFIX}${version}`;

        return {
          kind: 'branch',
          label: version,
          ref: branchRef,
          version: target.version,
          defaultDirectoryName: version === 'main' ? 'main' : version,
          supportedChips: target.supported_chips,
        };
      }

      return {
        kind: 'tag',
        label: target.version,
        ref: `refs/tags/${target.version}`,
        version: target.version,
        defaultDirectoryName: target.version,
        supportedChips: target.supported_chips,
      };
    });
  }

  public async switchSdkVersion(): Promise<void> {
    try {
      const sdkVersions = await this.discoverSiFliSdks();

      if (sdkVersions.length === 0) {
        const message = vscode.l10n.t('No SiFli SDKs found. Install one from the SDK Manager first.');
        vscode.window.showWarningMessage(message);
        return;
      }

      const selectedItem = await vscode.window.showQuickPick(
        sdkVersions.map(sdk => ({
          label: sdk.version,
          description: sdk.current ? vscode.l10n.t('(current)') : '',
          detail: vscode.l10n.t('Path: {0}{1}', sdk.path, sdk.valid ? '' : vscode.l10n.t(' (invalid)')),
          sdk,
        })),
        {
          placeHolder: vscode.l10n.t('Select a SiFli SDK version to switch'),
          canPickMany: false,
        }
      );

      if (selectedItem) {
        await this.activateSdk(selectedItem.sdk);
      }
    } catch (error) {
      this.logService.error('Error in switchSdkVersion:', error);
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to switch SDK version: {0}', String(error)));
    }
  }

  /**
   * 激活指定的 SDK
   */
  public async activateSdk(sdk: SdkVersion): Promise<void> {
    const result = await this.activateSdkVersion(sdk, true);
    if (!result.success && result.message) {
      vscode.window.showErrorMessage(result.message);
    }
  }

  public async activateSdkDetailed(input: {
    sdkPath?: string;
    version?: string;
    showNotifications?: boolean;
  }): Promise<{
    success: boolean;
    sdk?: SdkVersion;
    scriptPath?: string;
    message?: string;
  }> {
    try {
      const sdkVersions = await this.discoverSiFliSdks();
      const sdk = input.sdkPath
        ? sdkVersions.find(item => item.path === input.sdkPath)
        : input.version
          ? sdkVersions.find(item => item.version === input.version)
          : this.getCurrentSdk();

      if (!sdk) {
        return {
          success: false,
          message: vscode.l10n.t('No matching SiFli SDK found.'),
        };
      }

      const result = await this.activateSdkVersion(sdk, input.showNotifications ?? false);
      return {
        success: result.success,
        sdk,
        scriptPath: result.scriptPath,
        message: result.message,
      };
    } catch (error) {
      return {
        success: false,
        message: vscode.l10n.t('Failed to activate SDK: {0}', String(error)),
      };
    }
  }

  public async registerSdk(
    sdkPath: string,
    toolsPath?: string,
    toolchainSource?: ToolchainSource
  ): Promise<ManagedSdkSummary> {
    await this.configService.addSdkConfig(sdkPath, toolsPath, toolchainSource);
    return this.buildManagedSdkSummary(this.configService.getSdkConfig(sdkPath) || { path: sdkPath }, false);
  }

  public async renameSdkDirectory(
    sdkPath: string,
    newDirectoryName: string
  ): Promise<{ oldPath: string; newPath: string }> {
    const sanitizedName = newDirectoryName.trim();
    if (
      !sanitizedName ||
      sanitizedName === '.' ||
      sanitizedName === '..' ||
      sanitizedName.includes('/') ||
      sanitizedName.includes('\\')
    ) {
      throw new Error('目录名称无效。');
    }

    const parentDir = path.dirname(sdkPath);
    const newPath = path.join(parentDir, sanitizedName);

    if (sdkPath === newPath) {
      return { oldPath: sdkPath, newPath };
    }

    if (fs.existsSync(newPath)) {
      throw new Error(`目标目录已存在: ${newPath}`);
    }

    fs.renameSync(sdkPath, newPath);
    await this.configService.renameSdkPath(sdkPath, newPath);

    if (this.configService.getCurrentSdkPath() === sdkPath) {
      await this.configService.setCurrentSdkPath(newPath);
    }

    return { oldPath: sdkPath, newPath };
  }

  public async addSdkPath(sdkPath: string): Promise<void> {
    const result = await this.addSdkPathDetailed(sdkPath);
    if (result.message) {
      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    }
  }

  public async removeSdkPath(sdkPath: string): Promise<void> {
    const result = await this.removeSdkPathDetailed(sdkPath);
    if (result.message) {
      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showWarningMessage(result.message);
      }
    }
  }

  public async setSdkToolsPath(sdkPath: string, toolsPath: string): Promise<void> {
    const result = await this.setSdkToolsPathDetailed(sdkPath, toolsPath);
    if (result.message) {
      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    }
  }

  public getSdkToolsPath(sdkPath: string): string | undefined {
    return this.configService.getSdkToolsPath(sdkPath);
  }

  public getSdkToolchainSource(sdkPath: string): ToolchainSource | undefined {
    return this.configService.getSdkToolchainSource(sdkPath);
  }

  public async setSdkToolchainSource(sdkPath: string, toolchainSource: ToolchainSource): Promise<void> {
    await this.configService.setSdkToolchainSource(sdkPath, toolchainSource);
  }

  public getCurrentSdk(): SdkVersion | undefined {
    return this.configService.getCurrentSdk();
  }

  public getExportScriptPath(sdkPath?: string): string | undefined {
    const targetSdkPath = sdkPath || this.configService.getCurrentSdkPath();
    if (!targetSdkPath) {
      return undefined;
    }

    return this.getActivationScriptForPlatform(targetSdkPath)?.scriptPath;
  }

  public getInstallScriptPath(sdkPath: string): string | undefined {
    if (process.platform === 'win32') {
      const ps1Path = path.join(sdkPath, 'install.ps1');
      if (fs.existsSync(ps1Path)) {
        return ps1Path;
      }
    } else {
      const shPath = path.join(sdkPath, 'install.sh');
      if (fs.existsSync(shPath)) {
        return shPath;
      }
    }

    return undefined;
  }

  public async addSdkPathDetailed(
    sdkPath: string,
    toolsPath?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      if (!this.validateSdkPath(sdkPath)) {
        return {
          success: false,
          message: vscode.l10n.t('Invalid SDK path'),
        };
      }

      const installedPaths = this.configService.getInstalledSdkPaths();
      if (!installedPaths.includes(sdkPath)) {
        await this.configService.addSdkConfig(sdkPath, toolsPath);
        return {
          success: true,
          message: vscode.l10n.t('Added SDK path: {0}', sdkPath),
        };
      }

      if (toolsPath) {
        await this.configService.setSdkToolsPath(sdkPath, toolsPath);
      }

      return {
        success: true,
        message: vscode.l10n.t('SDK path already exists: {0}', sdkPath),
      };
    } catch (error) {
      return {
        success: false,
        message: vscode.l10n.t('Failed to add SDK path: {0}', String(error)),
      };
    }
  }

  public async removeSdkPathDetailed(sdkPath: string): Promise<{ success: boolean; message?: string }> {
    try {
      const installedPaths = this.configService.getInstalledSdkPaths();
      if (!installedPaths.includes(sdkPath)) {
        return {
          success: false,
          message: vscode.l10n.t('SDK path does not exist: {0}', sdkPath),
        };
      }

      await this.configService.removeSdkConfig(sdkPath);
      return {
        success: true,
        message: vscode.l10n.t('Removed SDK path: {0}', sdkPath),
      };
    } catch (error) {
      return {
        success: false,
        message: vscode.l10n.t('Failed to remove SDK path: {0}', String(error)),
      };
    }
  }

  public async setSdkToolsPathDetailed(
    sdkPath: string,
    toolsPath: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      await this.configService.setSdkToolsPath(sdkPath, toolsPath);
      return {
        success: true,
        message: vscode.l10n.t('Set toolchain path for SDK {0}: {1}', path.basename(sdkPath), toolsPath),
      };
    } catch (error) {
      return {
        success: false,
        message: vscode.l10n.t('Failed to set toolchain path: {0}', String(error)),
      };
    }
  }

  private async activateSdkVersion(
    sdk: SdkVersion,
    showNotifications: boolean
  ): Promise<{ success: boolean; scriptPath?: string; message?: string }> {
    try {
      this.logService.info(`Activating SDK: ${sdk.version} at ${sdk.path}`);

      if (!sdk.valid) {
        const message = vscode.l10n.t('Selected SDK path is invalid: {0}', sdk.path);
        this.logService.error(message);
        if (showNotifications) {
          vscode.window.showErrorMessage(message);
        }
        return { success: false, message };
      }

      const activationScript = this.getActivationScriptForPlatform(sdk.path);
      if (!activationScript) {
        const message = vscode.l10n.t('No export script found for the current platform in SDK path: {0}', sdk.path);
        this.logService.error(message);
        if (showNotifications) {
          vscode.window.showErrorMessage(message);
        }
        return { success: false, message };
      }

      this.logService.debug(`Using activation script: ${activationScript.scriptPath}`);
      await this.executeActivationScript(activationScript);
      await this.configService.setCurrentSdkPath(sdk.path);

      const successMessage = vscode.l10n.t('Switched to SiFli SDK version: {0}', sdk.version);
      this.logService.info(successMessage);
      if (showNotifications) {
        vscode.window.showInformationMessage(successMessage);
      }

      return {
        success: true,
        scriptPath: activationScript.scriptPath,
        message: successMessage,
      };
    } catch (error) {
      this.logService.error('Error activating SDK:', error);
      const message = vscode.l10n.t('Failed to activate SDK: {0}', String(error));
      if (showNotifications) {
        vscode.window.showErrorMessage(message);
      }
      return { success: false, message };
    }
  }

  private async buildManagedSdkSummary(sdkConfig: SdkConfig, isCurrent: boolean): Promise<ManagedSdkSummary> {
    const sdkPath = sdkConfig.path;
    const valid = this.validateSdkPath(sdkPath);
    const metadata = valid ? await this.gitService.getSdkMetadata(sdkPath) : this.createNonGitMetadata();
    const name = path.basename(sdkPath);
    const version = this.deriveSdkVersion(name, metadata);
    const canUpdateBranch = valid && metadata.isGitRepo && metadata.refType === 'branch';

    return {
      id: this.encodeSdkId(sdkPath),
      name,
      version,
      path: sdkPath,
      current: isCurrent,
      isCurrent,
      valid,
      isGitRepo: metadata.isGitRepo,
      ref: metadata.ref,
      refType: metadata.refType,
      hash: metadata.hash,
      isDirty: metadata.isDirty,
      canUpdate: canUpdateBranch,
      toolsPath: sdkConfig.toolsPath,
      toolchainSource: sdkConfig.toolchainSource,
      actions: {
        canActivate: valid,
        canSwitchRef: valid && metadata.isGitRepo,
        canUpdateBranch,
        canRename: true,
        canUpdateTools: !!this.getInstallScriptPath(sdkPath),
      },
    };
  }

  private deriveSdkVersion(directoryName: string, metadata: GitSdkMetadata): string {
    if (metadata.refType === 'tag' && metadata.ref) {
      return metadata.ref;
    }

    if (metadata.refType === 'branch' && metadata.ref) {
      return metadata.ref;
    }

    return directoryName || 'Unknown';
  }

  private createNonGitMetadata(): GitSdkMetadata {
    return {
      isGitRepo: false,
      ref: 'non-git',
      refType: 'unknown',
      hash: '',
      isDirty: false,
    };
  }

  private validateSdkPath(sdkPath: string): boolean {
    try {
      if (!fs.existsSync(path.join(sdkPath, 'customer'))) {
        return false;
      }

      return this.getActivationScriptForPlatform(sdkPath) !== null;
    } catch (error) {
      this.logService.error(`Error validating SDK path ${sdkPath}:`, error);
      return false;
    }
  }

  private getActivationScriptForPlatform(
    sdkPath: string
  ): { scriptPath: string; configPath: string; command: string } | null {
    if (process.platform === 'win32') {
      const ps1ScriptPath = path.join(sdkPath, 'export.ps1');
      if (fs.existsSync(ps1ScriptPath)) {
        return {
          scriptPath: ps1ScriptPath,
          configPath: ps1ScriptPath,
          command: './export.ps1',
        };
      }
    } else {
      const shScriptPath = path.join(sdkPath, 'export.sh');
      if (fs.existsSync(shScriptPath)) {
        return {
          scriptPath: shScriptPath,
          configPath: shScriptPath,
          command: '. ./export.sh',
        };
      }
    }

    return null;
  }

  private async setEnvironmentVariable(terminal: vscode.Terminal, name: string, value: string): Promise<void> {
    if (process.platform === 'win32') {
      terminal.sendText(`$env:${name}="${value}"`);
    } else {
      terminal.sendText(`export ${name}="${value}"`);
    }
  }

  private async executeActivationScript(activationScript: {
    scriptPath: string;
    configPath: string;
    command: string;
  }): Promise<void> {
    const terminal = await this.terminalService.getOrCreateSiFliTerminalAndCdProject(false, { autoExport: false });
    const scriptDir = path.dirname(activationScript.scriptPath);
    const toolsPath = this.configService.getSdkToolsPath(scriptDir);

    if (toolsPath && toolsPath.trim() !== '') {
      await this.setEnvironmentVariable(terminal, 'SIFLI_SDK_TOOLS_PATH', toolsPath);
    }

    const executeCommand =
      process.platform === 'win32' ? `& "${activationScript.scriptPath}"` : `. "${activationScript.scriptPath}"`;

    terminal.show();
    terminal.sendText(executeCommand);
    this.terminalService.markSdkEnvironmentPrepared();
  }
}
