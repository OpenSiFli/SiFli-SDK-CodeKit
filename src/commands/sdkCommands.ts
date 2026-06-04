import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { GitService } from '../services/gitService';
import { SdkService } from '../services/sdkService';
import { isSiFliProject } from '../utils/projectUtils';

export class SdkCommands {
  private static instance: SdkCommands;
  private configService: ConfigService;
  private gitService: GitService;
  private sdkService: SdkService;

  private constructor() {
    this.configService = ConfigService.getInstance();
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

  /**
   * 激活当前工作区选择的 SDK 环境
   */
  public async activateSdkEnvironment(): Promise<void> {
    await this.sdkService.activateSdkEnvironment();
  }

  /**
   * 切换当前工作区打开时是否自动激活 SDK 环境
   */
  public async toggleSdkEnvironmentAutoActivation(): Promise<void> {
    const nextValue = !this.configService.getSdkEnvironmentAutoActivate(isSiFliProject());
    await this.configService.setSdkEnvironmentAutoActivate(nextValue);
    vscode.window.showInformationMessage(
      nextValue
        ? vscode.l10n.t('SDK environment auto activation enabled for this workspace.')
        : vscode.l10n.t('SDK environment auto activation disabled for this workspace.')
    );
  }
}
