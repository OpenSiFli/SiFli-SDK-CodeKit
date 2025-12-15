import * as vscode from 'vscode';

/**
 * 工作区状态的类型定义
 * 这些状态是每个工作区独立的，不会在设置 UI 中显示
 */
export interface WorkspaceState {
  // 当前选择的 Board/芯片模组
  defaultChipModule?: string;
  // 当前选择的串口
  selectedSerialPort?: string;
  // 下载波特率
  downloadBaudRate?: number;
  // 监视波特率
  monitorBaudRate?: number;
  // 当前激活的 SDK 路径
  currentSdkPath?: string;
  // SDK export 脚本路径 (每个工作区可能使用不同的 SDK)
  sifliSdkExportScriptPath?: string;
  // 编译线程数
  numThreads?: number;
}

// 工作区状态的 key 常量
export const WORKSPACE_STATE_KEYS = {
  DEFAULT_CHIP_MODULE: 'defaultChipModule',
  SELECTED_SERIAL_PORT: 'selectedSerialPort',
  DOWNLOAD_BAUD_RATE: 'downloadBaudRate',
  MONITOR_BAUD_RATE: 'monitorBaudRate',
  CURRENT_SDK_PATH: 'currentSdkPath',
  SIFLI_SDK_EXPORT_SCRIPT_PATH: 'sifliSdkExportScriptPath',
  NUM_THREADS: 'numThreads',
} as const;

// 默认值
const DEFAULT_VALUES: Required<WorkspaceState> = {
  defaultChipModule: '',
  selectedSerialPort: '',
  downloadBaudRate: 1000000,
  monitorBaudRate: 1000000,
  currentSdkPath: '',
  sifliSdkExportScriptPath: '',
  numThreads: 8,
};

/**
 * 工作区状态服务
 * 用于管理每个工作区独立的运行时状态
 * 这些状态不会出现在 settings.json 中，避免多窗口配置干扰
 */
export class WorkspaceStateService {
  private static instance: WorkspaceStateService;
  private context: vscode.ExtensionContext | null = null;

  private constructor() {}

  public static getInstance(): WorkspaceStateService {
    if (!WorkspaceStateService.instance) {
      WorkspaceStateService.instance = new WorkspaceStateService();
    }
    return WorkspaceStateService.instance;
  }

  /**
   * 初始化服务，必须在扩展激活时调用
   */
  public initialize(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  /**
   * 确保服务已初始化
   */
  private ensureInitialized(): vscode.ExtensionContext {
    if (!this.context) {
      throw new Error('WorkspaceStateService not initialized. Call initialize() first.');
    }
    return this.context;
  }

  /**
   * 获取工作区状态值
   */
  public get<K extends keyof WorkspaceState>(key: K): WorkspaceState[K] {
    const context = this.ensureInitialized();
    const value = context.workspaceState.get<WorkspaceState[K]>(key);
    return value !== undefined ? value : DEFAULT_VALUES[key];
  }

  /**
   * 设置工作区状态值
   */
  public async set<K extends keyof WorkspaceState>(
    key: K,
    value: WorkspaceState[K]
  ): Promise<void> {
    const context = this.ensureInitialized();
    await context.workspaceState.update(key, value);
  }

  /**
   * 获取所有工作区状态
   */
  public getAll(): WorkspaceState {
    return {
      defaultChipModule: this.get('defaultChipModule'),
      selectedSerialPort: this.get('selectedSerialPort'),
      downloadBaudRate: this.get('downloadBaudRate'),
      monitorBaudRate: this.get('monitorBaudRate'),
      currentSdkPath: this.get('currentSdkPath'),
      sifliSdkExportScriptPath: this.get('sifliSdkExportScriptPath'),
      numThreads: this.get('numThreads'),
    };
  }

  /**
   * 清除指定的工作区状态
   */
  public async clear<K extends keyof WorkspaceState>(key: K): Promise<void> {
    const context = this.ensureInitialized();
    await context.workspaceState.update(key, undefined);
  }

  /**
   * 清除所有工作区状态
   */
  public async clearAll(): Promise<void> {
    const keys = Object.keys(WORKSPACE_STATE_KEYS) as Array<keyof typeof WORKSPACE_STATE_KEYS>;
    for (const key of keys) {
      await this.clear(WORKSPACE_STATE_KEYS[key] as keyof WorkspaceState);
    }
  }

  // ============ 便捷的 getter/setter 方法 ============

  // defaultChipModule
  public getDefaultChipModule(): string {
    return this.get('defaultChipModule') || '';
  }

  public async setDefaultChipModule(value: string): Promise<void> {
    await this.set('defaultChipModule', value);
  }

  // selectedSerialPort
  public getSelectedSerialPort(): string {
    return this.get('selectedSerialPort') || '';
  }

  public async setSelectedSerialPort(value: string): Promise<void> {
    await this.set('selectedSerialPort', value);
  }

  // downloadBaudRate
  public getDownloadBaudRate(): number {
    return this.get('downloadBaudRate') || DEFAULT_VALUES.downloadBaudRate;
  }

  public async setDownloadBaudRate(value: number): Promise<void> {
    await this.set('downloadBaudRate', value);
  }

  // monitorBaudRate
  public getMonitorBaudRate(): number {
    return this.get('monitorBaudRate') || DEFAULT_VALUES.monitorBaudRate;
  }

  public async setMonitorBaudRate(value: number): Promise<void> {
    await this.set('monitorBaudRate', value);
  }

  // currentSdkPath
  public getCurrentSdkPath(): string {
    return this.get('currentSdkPath') || '';
  }

  public async setCurrentSdkPath(value: string): Promise<void> {
    await this.set('currentSdkPath', value);
  }

  // sifliSdkExportScriptPath
  public getSifliSdkExportScriptPath(): string {
    return this.get('sifliSdkExportScriptPath') || '';
  }

  public async setSifliSdkExportScriptPath(value: string): Promise<void> {
    await this.set('sifliSdkExportScriptPath', value);
  }

  // numThreads
  public getNumThreads(): number {
    return this.get('numThreads') || DEFAULT_VALUES.numThreads;
  }

  public async setNumThreads(value: number): Promise<void> {
    await this.set('numThreads', value);
  }
}
