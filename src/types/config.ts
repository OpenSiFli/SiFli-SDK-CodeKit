export interface SdkConfig {
  path: string; // SDK路径
  toolsPath?: string; // 工具链路径
  // 后续可以添加其他SDK特定的配置项
  // customFlags?: string[];
  // buildOptions?: Record<string, any>;
  // debuggerSettings?: any;
}

/**
 * settings.json 中的全局/机器级别配置
 * 这些配置跨所有工作区共享，用户可以在设置 UI 中编辑
 */
export interface SiFliConfig {
  powershellPath?: string;
  embeddedPythonPath?: string; // 嵌入式 Python 路径
  useEmbeddedPython: boolean; // 是否使用嵌入式 Python
  customBoardSearchPath?: string; // 自定义 Board 搜索路径 (工作区级别)
  sdkConfigs: SdkConfig[]; // 已安装的 SDK 配置列表 (全局)
}

/**
 * 旧版 SiFliConfig 接口，用于数据迁移
 * @deprecated 请使用 SiFliConfig + WorkspaceState 替代
 */
export interface LegacySiFliConfig extends SiFliConfig {
  sifliSdkExportScriptPath?: string;
  defaultChipModule?: string;
  numThreads?: number;
  selectedSerialPort?: string;
}

export interface ExtensionState {
  hasRunInitialSetup: boolean;
}

export interface TerminalInfo {
  name: string;
  path: string;
  args: string[];
}

export interface SerialPort {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  productId?: string;
  vendorId?: string;
}
