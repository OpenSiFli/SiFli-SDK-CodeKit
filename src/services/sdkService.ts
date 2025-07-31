import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SdkVersion } from '../types';
import { ConfigService } from './configService';
import { TerminalService } from './terminalService';

export class SdkService {
  private static instance: SdkService;
  private configService: ConfigService;
  private terminalService: TerminalService;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.terminalService = TerminalService.getInstance();
  }

  public static getInstance(): SdkService {
    if (!SdkService.instance) {
      SdkService.instance = new SdkService();
    }
    return SdkService.instance;
  }

  /**
   * 发现所有 SiFli SDK
   */
  public async discoverSiFliSdks(): Promise<SdkVersion[]> {
    const sdkVersions: SdkVersion[] = [];
    const installedSdkPaths = this.configService.config.installedSdkPaths;
    const currentSdkPath = this.configService.config.sifliSdkExportScriptPath;

    // 从配置的 SDK 路径列表中发现 SDK
    for (const sdkPath of installedSdkPaths) {
      try {
        if (fs.existsSync(sdkPath)) {
          const version = this.extractVersionFromPath(sdkPath);
          const isCurrent = currentSdkPath ? currentSdkPath.startsWith(sdkPath) : false;
          
          sdkVersions.push({
            version,
            path: sdkPath,
            current: isCurrent,
            valid: this.validateSdkPath(sdkPath)
          });
        }
      } catch (error) {
        console.error(`[SdkService] Error checking SDK path ${sdkPath}:`, error);
      }
    }

    // 如果当前配置的 SDK 路径不在列表中，也添加进去
    if (currentSdkPath) {
      const currentSdkRoot = this.extractSdkRootFromExportScript(currentSdkPath);
      if (currentSdkRoot && !installedSdkPaths.includes(currentSdkRoot)) {
        const version = this.extractVersionFromPath(currentSdkRoot);
        sdkVersions.push({
          version,
          path: currentSdkRoot,
          current: true,
          valid: this.validateSdkPath(currentSdkRoot)
        });
      }
    }

    // 确保只有一个 SDK 被标记为 current
    this.ensureSingleCurrentSdk(sdkVersions);

    // 按版本排序
    sdkVersions.sort((a, b) => b.version.localeCompare(a.version));

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
      // 假设导出脚本在 SDK 根目录
      return scriptDir;
    } catch (error) {
      console.error('[SdkService] Error extracting SDK root from export script:', error);
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
        return false;
      }

      // 检查当前平台对应的导出脚本
      const activationScript = this.getActivationScriptForPlatform(sdkPath);
      return activationScript !== null;
    } catch (error) {
      console.error(`[SdkService] Error validating SDK path ${sdkPath}:`, error);
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
      const sdkVersions = await this.discoverSiFliSdks();
      
      if (sdkVersions.length === 0) {
        vscode.window.showWarningMessage(
          '未发现任何 SiFli SDK。请先使用 SDK 管理器安装 SDK。'
        );
        return;
      }

      const quickPickItems = sdkVersions.map(sdk => ({
        label: sdk.version,
        description: sdk.current ? '(当前)' : '',
        detail: `路径: ${sdk.path}${sdk.valid ? '' : ' (无效)'}`,
        sdk
      }));

      const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: '选择要切换的 SiFli SDK 版本',
        canPickMany: false
      });

      // if (selectedItem && !selectedItem.sdk.current) {
      if (selectedItem) {
        await this.activateSdk(selectedItem.sdk);
      }
    } catch (error) {
      console.error('[SdkService] Error in switchSdkVersion:', error);
      vscode.window.showErrorMessage(`切换 SDK 版本失败: ${error}`);
    }
  }

  /**
   * 激活指定的 SDK
   */
  public async activateSdk(sdk: SdkVersion): Promise<void> {
    try {
      if (!sdk.valid) {
        vscode.window.showErrorMessage(`选定的 SDK 路径无效: ${sdk.path}`);
        return;
      }

      // 获取当前平台对应的激活脚本路径
      const activationScript = this.getActivationScriptForPlatform(sdk.path);
      if (!activationScript) {
        vscode.window.showErrorMessage(`在 SDK 路径中未找到适用于当前平台的导出脚本: ${sdk.path}`);
        return;
      }

      // 更新配置（保存找到的脚本路径用于配置）
      await this.configService.updateConfigValue('sifliSdkExportScriptPath', activationScript.configPath);

      // 添加到已安装 SDK 路径列表（如果不存在）
      const installedPaths = this.configService.config.installedSdkPaths;
      if (!installedPaths.includes(sdk.path)) {
        await this.configService.updateConfigValue('installedSdkPaths', [...installedPaths, sdk.path]);
      }

      // 在终端中执行激活命令
      await this.executeActivationScript(activationScript);

      vscode.window.showInformationMessage(
        `已切换到 SiFli SDK 版本: ${sdk.version}`
      );

      // 重新加载配置以更新 UI
      await this.configService.updateConfiguration();

    } catch (error) {
      console.error('[SdkService] Error activating SDK:', error);
      vscode.window.showErrorMessage(`激活 SDK 失败: ${error}`);
    }
  }

  /**
   * 获取当前平台对应的激活脚本信息
   */
  private getActivationScriptForPlatform(sdkPath: string): { scriptPath: string; configPath: string; command: string } | null {
    if (process.platform === 'win32') {
      // Windows 平台
      const ps1ScriptPath = path.join(sdkPath, 'export.ps1');
      if (fs.existsSync(ps1ScriptPath)) {
        return {
          scriptPath: ps1ScriptPath,
          configPath: ps1ScriptPath, // 配置中保存的路径
          command: './export.ps1'    // 在SDK目录下执行的相对命令
        };
      }
    } else {
      // Unix-like 系统 (macOS, Linux)
      const shScriptPath = path.join(sdkPath, 'export.sh');
      if (fs.existsSync(shScriptPath)) {
        return {
          scriptPath: shScriptPath,
          configPath: shScriptPath,    // 配置中保存的路径
          command: '. ./export.sh'     // 在SDK目录下执行的相对命令
        };
      }
    }
    
    return null;
  }

  /**
   * 在终端中执行 SDK 激活脚本
   */
  private async executeActivationScript(activationScript: { scriptPath: string; configPath: string; command: string }): Promise<void> {
    try {
      const terminal = await this.terminalService.getOrCreateSiFliTerminalAndCdProject();
      
      // 构建完整命令：切换到SDK目录并执行激活脚本
      const scriptDir = path.dirname(activationScript.scriptPath);
      const command = `cd "${scriptDir}" && ${activationScript.command}`;

      // 显示并聚焦终端
      terminal.show();
      
      // 发送命令到终端
      terminal.sendText(command);
      
      console.log(`[SdkService] Executed SDK activation command: ${command}`);
    } catch (error) {
      console.error('[SdkService] Error executing activation script:', error);
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
   * 添加 SDK 路径到配置
   */
  public async addSdkPath(sdkPath: string): Promise<void> {
    try {
      if (!this.validateSdkPath(sdkPath)) {
        throw new Error('无效的 SDK 路径');
      }

      const installedPaths = this.configService.config.installedSdkPaths;
      if (!installedPaths.includes(sdkPath)) {
        await this.configService.updateConfigValue('installedSdkPaths', [...installedPaths, sdkPath]);
        vscode.window.showInformationMessage(`已添加 SDK 路径: ${sdkPath}`);
      } else {
        vscode.window.showInformationMessage(`SDK 路径已存在: ${sdkPath}`);
      }
    } catch (error) {
      console.error('[SdkService] Error adding SDK path:', error);
      vscode.window.showErrorMessage(`添加 SDK 路径失败: ${error}`);
    }
  }

  /**
   * 移除 SDK 路径
   */
  public async removeSdkPath(sdkPath: string): Promise<void> {
    try {
      const installedPaths = this.configService.config.installedSdkPaths;
      const updatedPaths = installedPaths.filter(path => path !== sdkPath);
      
      if (updatedPaths.length !== installedPaths.length) {
        await this.configService.updateConfigValue('installedSdkPaths', updatedPaths);
        vscode.window.showInformationMessage(`已移除 SDK 路径: ${sdkPath}`);
      } else {
        vscode.window.showWarningMessage(`SDK 路径不存在: ${sdkPath}`);
      }
    } catch (error) {
      console.error('[SdkService] Error removing SDK path:', error);
      vscode.window.showErrorMessage(`移除 SDK 路径失败: ${error}`);
    }
  }
}
