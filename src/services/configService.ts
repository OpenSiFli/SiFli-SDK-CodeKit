import * as vscode from 'vscode';
import { SiFliConfig, SdkVersion, SdkConfig, LegacySiFliConfig } from '../types';
import { WorkspaceStateService } from './workspaceStateService';
import { CONFIG_MIGRATION_VERSIONS } from '../constants';
import { LogService } from './logService';

export class ConfigService {
  private static instance: ConfigService;
  private _config: SiFliConfig;
  private _detectedSdkVersions: SdkVersion[] = [];
  private workspaceStateService: WorkspaceStateService;
  private logService: LogService;

  private constructor() {
    this.workspaceStateService = WorkspaceStateService.getInstance();
    this.logService = LogService.getInstance();
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

  /**
   * 加载 settings.json 中的全局配置
   */
  private loadConfiguration(): SiFliConfig {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    
    return {
      powershellPath: config.get<string>('powershellPath'),
      embeddedPythonPath: config.get<string>('embeddedPythonPath'),
      useEmbeddedPython: config.get<boolean>('useEmbeddedPython') ?? true,
      customBoardSearchPath: config.get<string>('customBoardSearchPath'),
      sdkConfigs: config.get<SdkConfig[]>('sdkConfigs') || []
    };
  }

  /**
   * 比较两个版本号
   * @returns 负数表示 v1 < v2，0 表示相等，正数表示 v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 !== p2) {
        return p1 - p2;
      }
    }
    return 0;
  }

  /**
   * 检查是否需要执行指定版本的迁移
   * @param lastVersion 用户上次使用的版本
   * @param migrationVersion 迁移引入的版本
   * @returns 如果用户版本低于迁移版本，返回 true
   */
  private needsMigration(lastVersion: string | undefined, migrationVersion: string): boolean {
    if (!lastVersion) {
      // 如果没有记录版本，说明是首次安装或从很旧的版本升级，需要迁移
      return true;
    }
    return this.compareVersions(lastVersion, migrationVersion) < 0;
  }

  /**
   * 执行配置迁移
   * 根据用户上次使用的版本号决定是否执行迁移
   * @param context 扩展上下文，用于读取和保存版本信息
   */
  public async runConfigMigrations(context: vscode.ExtensionContext): Promise<void> {
    const lastVersion = context.globalState.get<string>('sifli-sdk-codekit.lastMigrationVersion');
    
    this.logService.debug(`Last migration version: ${lastVersion || 'none'}`);

    // 执行 v1.2.2 的迁移：将配置从 settings.json 迁移到 workspaceState
    if (this.needsMigration(lastVersion, CONFIG_MIGRATION_VERSIONS.WORKSPACE_STATE_MIGRATION)) {
      this.logService.info(`Running config migration for v${CONFIG_MIGRATION_VERSIONS.WORKSPACE_STATE_MIGRATION}...`);
      await this.migrateToWorkspaceState();
      this.logService.info('Config migration completed');
    }

    // 未来如果有新的迁移，在这里添加：
    // if (this.needsMigration(lastVersion, CONFIG_MIGRATION_VERSIONS.SOME_NEW_MIGRATION)) {
    //   await this.migrateNewFeature();
    // }

    // 获取当前扩展版本
    const currentVersion = vscode.extensions.getExtension('SiFli.sifli-sdk-codekit')?.packageJSON.version;
    if (currentVersion) {
      // 保存当前版本为最后迁移版本
      await context.globalState.update('sifli-sdk-codekit.lastMigrationVersion', currentVersion);
    }
  }

  /**
   * v1.2.2 迁移：将旧版配置从 settings.json 迁移到 workspaceState
   */
  private async migrateToWorkspaceState(): Promise<void> {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    
    // 迁移 defaultChipModule
    const oldDefaultChipModule = config.get<string>('defaultChipModule');
    if (oldDefaultChipModule && !this.workspaceStateService.getDefaultChipModule()) {
      await this.workspaceStateService.setDefaultChipModule(oldDefaultChipModule);
      this.logService.debug(`Migrated defaultChipModule: ${oldDefaultChipModule}`);
    }

    // 迁移 selectedSerialPort
    const oldSelectedSerialPort = config.get<string>('selectedSerialPort');
    if (oldSelectedSerialPort && !this.workspaceStateService.getSelectedSerialPort()) {
      await this.workspaceStateService.setSelectedSerialPort(oldSelectedSerialPort);
      this.logService.debug(`Migrated selectedSerialPort: ${oldSelectedSerialPort}`);
    }

    // 迁移 numThreads
    const oldNumThreads = config.get<number>('numThreads');
    if (oldNumThreads && oldNumThreads !== 8) { // 8 是默认值
      const currentNumThreads = this.workspaceStateService.getNumThreads();
      if (currentNumThreads === 8) { // 如果 workspaceState 中还是默认值，则迁移
        await this.workspaceStateService.setNumThreads(oldNumThreads);
        this.logService.debug(`Migrated numThreads: ${oldNumThreads}`);
      }
    }

    // 迁移 sifliSdkExportScriptPath
    const oldExportScriptPath = config.get<string>('sifliSdkExportScriptPath');
    if (oldExportScriptPath && !this.workspaceStateService.getSifliSdkExportScriptPath()) {
      await this.workspaceStateService.setSifliSdkExportScriptPath(oldExportScriptPath);
      this.logService.debug(`Migrated sifliSdkExportScriptPath: ${oldExportScriptPath}`);
    }
  }

  /**
   * @deprecated 使用 runConfigMigrations 替代
   * 保留此方法以保持向后兼容
   */
  public async migrateOldConfiguration(): Promise<void> {
    await this.migrateToWorkspaceState();
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

  /**
   * 获取当前选择的 Board 名称
   * 从 workspaceState 读取
   */
  public getSelectedBoardName(): string {
    return this.workspaceStateService.getDefaultChipModule() || 'N/A';
  }

  /**
   * 设置当前选择的 Board 名称
   * 保存到 workspaceState
   */
  public async setSelectedBoardName(boardName: string): Promise<void> {
    await this.workspaceStateService.setDefaultChipModule(boardName);
  }

  /**
   * 获取编译线程数
   * 从 workspaceState 读取
   */
  public getNumThreads(): number {
    return this.workspaceStateService.getNumThreads();
  }

  /**
   * 设置编译线程数
   * 保存到 workspaceState
   */
  public async setNumThreads(numThreads: number): Promise<void> {
    await this.workspaceStateService.setNumThreads(numThreads);
  }

  /**
   * 获取 SDK export 脚本路径
   * 从 workspaceState 读取
   */
  public getSifliSdkExportScriptPath(): string {
    return this.workspaceStateService.getSifliSdkExportScriptPath();
  }

  /**
   * 设置 SDK export 脚本路径
   * 保存到 workspaceState
   */
  public async setSifliSdkExportScriptPath(path: string): Promise<void> {
    await this.workspaceStateService.setSifliSdkExportScriptPath(path);
  }

  /**
   * 获取当前激活的 SDK 路径
   * 从 workspaceState 读取
   */
  public getCurrentSdkPath(): string {
    return this.workspaceStateService.getCurrentSdkPath();
  }

  /**
   * 设置当前激活的 SDK 路径
   * 保存到 workspaceState
   */
  public async setCurrentSdkPath(path: string): Promise<void> {
    await this.workspaceStateService.setCurrentSdkPath(path);
    // 同时更新 detectedSdkVersions 中的 current 标记
    this._detectedSdkVersions = this._detectedSdkVersions.map(sdk => ({
      ...sdk,
      current: sdk.path === path
    }));
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
