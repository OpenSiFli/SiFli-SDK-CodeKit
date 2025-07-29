import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { SdkService } from '../services/sdkService';

export class SdkCommands {
  private static instance: SdkCommands;
  private gitService: GitService;
  private sdkService: SdkService;

  private constructor() {
    this.gitService = GitService.getInstance();
    this.sdkService = SdkService.getInstance();
  }

  public static getInstance(): SdkCommands {
    if (!SdkCommands.instance) {
      SdkCommands.instance = new SdkCommands();
    }
    return SdkCommands.instance;
  }

  /**
   * 管理 SiFli SDK 安装
   */
  public async manageSiFliSdk(context: vscode.ExtensionContext): Promise<void> {
    // 这里将调用 WebView 提供者
    const { WebviewProvider } = await import('../providers/webviewProvider');
    const webviewProvider = WebviewProvider.getInstance();
    await webviewProvider.createSdkManagementWebview(context);
  }

  /**
   * 安装 SiFli SDK
   */
  public async installSiFliSdk(
    source: 'github' | 'gitee',
    type: 'tag' | 'branch',
    name: string,
    installPath: string,
    webview?: vscode.Webview
  ): Promise<void> {
    try {
      await this.gitService.installSiFliSdk(source, type, name, installPath, webview);
      
      // 安装完成后，添加到 SDK 路径列表
      await this.sdkService.addSdkPath(installPath);
      
      // 重新发现 SDK
      const sdkVersions = await this.sdkService.discoverSiFliSdks();
      // 这里可以通知其他组件更新 UI
      
    } catch (error) {
      console.error('[SdkCommands] Error installing SDK:', error);
      throw error;
    }
  }

  /**
   * 获取 SDK 发布版本列表
   */
  public async fetchSdkReleases(source: 'github' | 'gitee') {
    try {
      return await this.gitService.fetchSiFliSdkReleases(source);
    } catch (error) {
      console.error('[SdkCommands] Error fetching SDK releases:', error);
      throw error;
    }
  }

  /**
   * 获取 SDK 分支列表
   */
  public async fetchSdkBranches(source: 'github' | 'gitee') {
    try {
      return await this.gitService.fetchSiFliSdkBranches(source);
    } catch (error) {
      console.error('[SdkCommands] Error fetching SDK branches:', error);
      throw error;
    }
  }

  /**
   * 切换 SDK 版本
   */
  public async switchSdkVersion(): Promise<void> {
    await this.sdkService.switchSdkVersion();
  }
}
