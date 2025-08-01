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
