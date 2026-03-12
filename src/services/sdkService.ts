import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SdkVersion } from '../types';
import { ConfigService } from './configService';
import { TerminalService } from './terminalService';
import { LogService } from './logService';

export class SdkService {
  private static instance: SdkService;
  private configService: ConfigService;
  private terminalService: TerminalService;
  private logService: LogService;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.terminalService = TerminalService.getInstance();
    this.logService = LogService.getInstance();
  }

  public static getInstance(): SdkService {
    if (!SdkService.instance) {
      SdkService.instance = new SdkService();
    }
    return SdkService.instance;
  }

  /**
   * 发现所有 SiFli SDK
   * @param autoRemoveInvalid 是否自动移除不存在的 SDK 路径，默认为 true
   */
  public async discoverSiFliSdks(autoRemoveInvalid = true): Promise<SdkVersion[]> {
    this.logService.info('Starting SDK discovery...');
    const sdkVersions: SdkVersion[] = [];
    const installedSdkPaths = this.configService.getInstalledSdkPaths();
    const currentSdkPath = this.configService.getCurrentSdkPath();
    const invalidPaths: string[] = [];

    this.logService.debug(`Configured SDK paths: ${installedSdkPaths.join(', ')}`);
    this.logService.debug(`Current SDK path: ${currentSdkPath || 'None'}`);

    // 从配置的 SDK 路径列表中发现 SDK
    for (const sdkPath of installedSdkPaths) {
      try {
        if (fs.existsSync(sdkPath)) {
          const version = this.extractVersionFromPath(sdkPath);
          const isCurrent = currentSdkPath === sdkPath;
          const isValid = this.validateSdkPath(sdkPath);

          sdkVersions.push({
            version,
            path: sdkPath,
            current: isCurrent,
            valid: isValid,
          });

          this.logService.debug(`Found SDK: ${version} at ${sdkPath} (valid: ${isValid}, current: ${isCurrent})`);
        } else {
          this.logService.warn(`SDK path does not exist: ${sdkPath}`);
          invalidPaths.push(sdkPath);
        }
      } catch (error) {
        this.logService.error(`Error checking SDK path ${sdkPath}:`, error);
        invalidPaths.push(sdkPath);
      }
    }

    // 自动移除无效的 SDK 路径
    if (autoRemoveInvalid && invalidPaths.length > 0) {
      this.logService.info(`Removing ${invalidPaths.length} invalid SDK path(s) from configuration...`);
      for (const invalidPath of invalidPaths) {
        await this.configService.removeSdkConfig(invalidPath);
        this.logService.debug(`Removed invalid SDK path: ${invalidPath}`);
      }

      // 如果当前激活的 SDK 也是无效的，清除它
      if (currentSdkPath && invalidPaths.includes(currentSdkPath)) {
        await this.configService.setCurrentSdkPath('');
        this.logService.info('Cleared invalid current SDK path');
      }
    }

    // 如果当前配置的 SDK 路径不在列表中，也添加进去
    if (currentSdkPath) {
      const currentSdkRoot = this.extractSdkRootFromExportScript(currentSdkPath);
      if (currentSdkRoot && !installedSdkPaths.includes(currentSdkRoot)) {
        const version = this.extractVersionFromPath(currentSdkRoot);
        const isValid = this.validateSdkPath(currentSdkRoot);
        sdkVersions.push({
          version,
          path: currentSdkRoot,
          current: true,
          valid: isValid,
        });
        this.logService.debug(
          `Added current SDK from export script: ${version} at ${currentSdkRoot} (valid: ${isValid})`
        );
      }
    }

    // 确保只有一个 SDK 被标记为 current
    this.ensureSingleCurrentSdk(sdkVersions);

    // 按版本排序
    sdkVersions.sort((a, b) => b.version.localeCompare(a.version));

    this.logService.info(`SDK discovery completed. Found ${sdkVersions.length} SDK(s)`);
    return sdkVersions;
  }

  /**
   * 从路径中提取版本号
   */
  private extractVersionFromPath(sdkPath: string): string {
    const basename = path.basename(sdkPath);

    // 尝试从目录名中提取版本号
    const versionMatch = basename.match(/(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      return versionMatch[1];
    }

    // 尝试从 git tag 获取版本
    try {
      const gitHeadPath = path.join(sdkPath, '.git', 'HEAD');
      if (fs.existsSync(gitHeadPath)) {
        // 这里可以添加更复杂的 git 版本检测逻辑
        return basename;
      }
    } catch (error) {
      // Ignore git errors
    }

    return basename || 'Unknown';
  }

  /**
   * 从导出脚本路径中提取 SDK 根目录
   */
  private extractSdkRootFromExportScript(exportScriptPath: string): string | null {
    try {
      const scriptDir = path.dirname(exportScriptPath);
      return scriptDir;
    } catch (error) {
      this.logService.error('Error extracting SDK root from export script:', error);
      return null;
    }
  }

  /**
   * 验证 SDK 路径是否有效
   */
  private validateSdkPath(sdkPath: string): boolean {
    try {
      // 检查必要的目录
      const customerDir = path.join(sdkPath, 'customer');
      if (!fs.existsSync(customerDir)) {
        this.logService.debug(`SDK validation failed: customer directory not found at ${customerDir}`);
        return false;
      }

      // 检查当前平台对应的导出脚本
      const activationScript = this.getActivationScriptForPlatform(sdkPath);
      const isValid = activationScript !== null;

      if (!isValid) {
        this.logService.debug(`SDK validation failed: no activation script found for current platform at ${sdkPath}`);
      }

      return isValid;
    } catch (error) {
      this.logService.error(`Error validating SDK path ${sdkPath}:`, error);
      return false;
    }
  }

  /**
   * 确保只有一个 SDK 被标记为当前
   */
  private ensureSingleCurrentSdk(sdkVersions: SdkVersion[]): void {
    const currentSdks = sdkVersions.filter(sdk => sdk.current);

    if (currentSdks.length > 1) {
      // 如果有多个当前 SDK，只保留第一个
      for (let i = 1; i < currentSdks.length; i++) {
        currentSdks[i].current = false;
      }
    }
  }

  /**
   * 切换 SDK 版本
   */
  public async switchSdkVersion(): Promise<void> {
    try {
      this.logService.info('Starting SDK version switch...');
      const sdkVersions = await this.discoverSiFliSdks();

      if (sdkVersions.length === 0) {
        const message = vscode.l10n.t('No SiFli SDKs found. Install one from the SDK Manager first.');
        this.logService.warn(message);
        vscode.window.showWarningMessage(message);
        return;
      }

      const quickPickItems = sdkVersions.map(sdk => ({
        label: sdk.version,
        description: sdk.current ? vscode.l10n.t('(current)') : '',
        detail: vscode.l10n.t('Path: {0}{1}', sdk.path, sdk.valid ? '' : vscode.l10n.t(' (invalid)')),
        sdk,
      }));

      const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: vscode.l10n.t('Select a SiFli SDK version to switch'),
        canPickMany: false,
      });

      // if (selectedItem && !selectedItem.sdk.current) {
      if (selectedItem) {
        this.logService.info(`User selected SDK: ${selectedItem.sdk.version} at ${selectedItem.sdk.path}`);
        await this.activateSdk(selectedItem.sdk);
      } else {
        this.logService.info('SDK version switch cancelled by user');
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

  /**
   * 获取当前平台对应的激活脚本信息
   */
  private getActivationScriptForPlatform(
    sdkPath: string
  ): { scriptPath: string; configPath: string; command: string } | null {
    if (process.platform === 'win32') {
      // Windows 平台
      const ps1ScriptPath = path.join(sdkPath, 'export.ps1');
      if (fs.existsSync(ps1ScriptPath)) {
        return {
          scriptPath: ps1ScriptPath,
          configPath: ps1ScriptPath, // 配置中保存的路径
          command: './export.ps1', // 在SDK目录下执行的相对命令
        };
      }
    } else {
      // Unix-like 系统 (macOS, Linux)
      const shScriptPath = path.join(sdkPath, 'export.sh');
      if (fs.existsSync(shScriptPath)) {
        return {
          scriptPath: shScriptPath,
          configPath: shScriptPath, // 配置中保存的路径
          command: '. ./export.sh', // 在SDK目录下执行的相对命令
        };
      }
    }

    return null;
  }

  /**
   * 在终端中设置环境变量
   */
  private async setEnvironmentVariable(terminal: vscode.Terminal, name: string, value: string): Promise<void> {
    this.logService.info(`Setting environment variable ${name}: ${value}`);

    if (process.platform === 'win32') {
      // Windows PowerShell 设置环境变量
      terminal.sendText(`$env:${name}="${value}"`);
    } else {
      // Unix-like 系统设置环境变量
      terminal.sendText(`export ${name}="${value}"`);
    }
  }

  /**
   * 在终端中执行 SDK 激活脚本
   */
  private async executeActivationScript(activationScript: {
    scriptPath: string;
    configPath: string;
    command: string;
  }): Promise<void> {
    try {
      this.logService.info(`Executing SDK activation script: ${activationScript.scriptPath}`);
      const terminal = await this.terminalService.getOrCreateSiFliTerminalAndCdProject(false, { autoExport: false });

      const scriptDir = path.dirname(activationScript.scriptPath);

      // 获取当前SDK的工具链路径
      const toolsPath = this.configService.getSdkToolsPath(scriptDir);

      // 先设置 SIFLI_SDK_TOOLS_PATH 环境变量（如果有配置的话）
      if (toolsPath && toolsPath.trim() !== '') {
        await this.setEnvironmentVariable(terminal, 'SIFLI_SDK_TOOLS_PATH', toolsPath);
      }

      // 直接执行导出脚本的绝对路径
      let executeCommand: string;
      if (process.platform === 'win32') {
        // Windows PowerShell 使用配置的 PowerShell 路径和 -ExecutionPolicy Bypass 执行脚本
        const powershellPath = this.terminalService.getPowerShellExecutablePath();
        executeCommand = `& "${activationScript.scriptPath}"`;
      } else {
        // Unix-like 系统执行脚本
        executeCommand = `. "${activationScript.scriptPath}"`;
      }

      // 显示并聚焦终端
      terminal.show();

      // 发送命令到终端
      terminal.sendText(executeCommand);

      this.terminalService.markSdkEnvironmentPrepared();

      this.logService.info(`SDK activation script executed successfully: ${executeCommand}`);
    } catch (error) {
      this.logService.error('Error executing activation script:', error);
      throw error;
    }
  }

  /**
   * 获取当前激活的 SDK
   */
  public getCurrentSdk(): SdkVersion | undefined {
    return this.configService.getCurrentSdk();
  }

  /**
   * 根据 SDK 路径获取对应平台的 export 脚本路径
   * @param sdkPath SDK 根目录路径，如果不传则使用当前激活的 SDK
   * @returns export 脚本的完整路径，如果不存在则返回 undefined
   */
  public getExportScriptPath(sdkPath?: string): string | undefined {
    const targetSdkPath = sdkPath || this.configService.getCurrentSdkPath();
    if (!targetSdkPath) {
      return undefined;
    }

    if (process.platform === 'win32') {
      const ps1Path = path.join(targetSdkPath, 'export.ps1');
      if (fs.existsSync(ps1Path)) {
        return ps1Path;
      }
    } else {
      const shPath = path.join(targetSdkPath, 'export.sh');
      if (fs.existsSync(shPath)) {
        return shPath;
      }
    }

    return undefined;
  }

  /**
   * 添加 SDK 路径到配置
   */
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

  /**
   * 移除 SDK 路径
   */
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

  /**
   * 设置SDK的工具链路径
   */
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

  /**
   * 获取SDK的工具链路径
   */
  public getSdkToolsPath(sdkPath: string): string | undefined {
    return this.configService.getSdkToolsPath(sdkPath);
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
}
