import * as vscode from 'vscode';
import { SiFliConfig, SdkVersion, SdkConfig } from '../types';

export class ConfigService {
  private static instance: ConfigService;
  private _config: SiFliConfig;
  private _detectedSdkVersions: SdkVersion[] = [];

  private constructor() {
    this._config = this.loadConfiguration();
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  public get config(): SiFliConfig {
    return this._config;
  }

  public get detectedSdkVersions(): SdkVersion[] {
    return this._detectedSdkVersions;
  }

  public set detectedSdkVersions(versions: SdkVersion[]) {
    this._detectedSdkVersions = versions;
  }

  private loadConfiguration(): SiFliConfig {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    
    return {
      powershellPath: config.get<string>('powershellPath'),
      sifliSdkExportScriptPath: config.get<string>('sifliSdkExportScriptPath'),
      defaultChipModule: config.get<string>('defaultChipModule') || '',
      numThreads: config.get<number>('numThreads') || 8,
      customBoardSearchPath: config.get<string>('customBoardSearchPath'),
      selectedSerialPort: config.get<string>('selectedSerialPort'),
      sdkConfigs: config.get<SdkConfig[]>('sdkConfigs') || []
    };
  }

  public async updateConfiguration(): Promise<void> {
    this._config = this.loadConfiguration();
  }

  public async updateConfigValue<K extends keyof SiFliConfig>(
    key: K, 
    value: SiFliConfig[K], 
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    await config.update(key, value, target);
    this._config[key] = value;
  }

  public getCurrentSdk(): SdkVersion | undefined {
    return this._detectedSdkVersions.find(sdk => sdk.current);
  }

  public getSelectedBoardName(): string {
    return this._config.defaultChipModule || 'N/A';
  }

  public getNumThreads(): number {
    return this._config.numThreads;
  }

  /**
   * 获取所有已安装的SDK路径（兼容性方法）
   */
  public getInstalledSdkPaths(): string[] {
    return this._config.sdkConfigs.map(config => config.path);
  }

  /**
   * 添加SDK配置
   */
  public async addSdkConfig(sdkPath: string, toolsPath?: string): Promise<void> {
    const updatedConfigs = [...this._config.sdkConfigs];
    // 检查是否已存在
    const existingIndex = updatedConfigs.findIndex(config => config.path === sdkPath);
    if (existingIndex === -1) {
      updatedConfigs.push({ path: sdkPath, toolsPath });
    } else {
      // 更新现有配置
      updatedConfigs[existingIndex] = { ...updatedConfigs[existingIndex], toolsPath };
    }
    await this.updateConfigValue('sdkConfigs', updatedConfigs);
  }

  /**
   * 移除SDK配置
   */
  public async removeSdkConfig(sdkPath: string): Promise<void> {
    const updatedConfigs = this._config.sdkConfigs.filter(config => config.path !== sdkPath);
    await this.updateConfigValue('sdkConfigs', updatedConfigs);
  }

  /**
   * 设置指定SDK的工具链路径
   */
  public async setSdkToolsPath(sdkPath: string, toolsPath: string): Promise<void> {
    const updatedConfigs = [...this._config.sdkConfigs];
    const existingIndex = updatedConfigs.findIndex(config => config.path === sdkPath);
    
    if (existingIndex === -1) {
      // 如果SDK不存在，添加新的配置
      updatedConfigs.push({ path: sdkPath, toolsPath });
    } else {
      // 更新现有SDK的工具链路径
      updatedConfigs[existingIndex] = { ...updatedConfigs[existingIndex], toolsPath };
    }
    await this.updateConfigValue('sdkConfigs', updatedConfigs);
  }

  /**
   * 获取指定SDK的工具链路径
   */
  public getSdkToolsPath(sdkPath: string): string | undefined {
    const config = this._config.sdkConfigs.find(config => config.path === sdkPath);
    return config?.toolsPath;
  }

  /**
   * 移除指定SDK的工具链路径
   */
  public async removeSdkToolsPath(sdkPath: string): Promise<void> {
    const updatedConfigs = [...this._config.sdkConfigs];
    const existingIndex = updatedConfigs.findIndex(config => config.path === sdkPath);
    
    if (existingIndex !== -1) {
      // 移除工具链路径，但保留SDK配置
      updatedConfigs[existingIndex] = { ...updatedConfigs[existingIndex], toolsPath: undefined };
    }
    await this.updateConfigValue('sdkConfigs', updatedConfigs);
  }

  /**
   * 获取当前激活SDK的工具链路径
   */
  public getCurrentSdkToolsPath(): string | undefined {
    const currentSdk = this.getCurrentSdk();
    if (currentSdk) {
      return this.getSdkToolsPath(currentSdk.path);
    }
    return undefined;
  }

  /**
   * 获取指定SDK的完整配置
   */
  public getSdkConfig(sdkPath: string): SdkConfig | undefined {
    return this._config.sdkConfigs.find(config => config.path === sdkPath);
  }

  /**
   * 设置指定SDK的完整配置
   */
  public async setSdkConfig(sdkPath: string, config: SdkConfig): Promise<void> {
    const updatedConfigs = [...this._config.sdkConfigs];
    const existingIndex = updatedConfigs.findIndex(c => c.path === sdkPath);
    
    if (existingIndex === -1) {
      updatedConfigs.push({ ...config, path: sdkPath });
    } else {
      updatedConfigs[existingIndex] = { ...config, path: sdkPath };
    }
    await this.updateConfigValue('sdkConfigs', updatedConfigs);
  }
}
