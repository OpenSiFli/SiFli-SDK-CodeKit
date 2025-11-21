export interface SdkConfig {
  path: string; // SDK路径
  toolsPath?: string; // 工具链路径
  // 后续可以添加其他SDK特定的配置项
  // customFlags?: string[];
  // buildOptions?: Record<string, any>;
  // debuggerSettings?: any;
}

export interface SiFliConfig {
  powershellPath?: string;
  sifliSdkExportScriptPath?: string;
  embeddedPythonPath?: string; // 嵌入式 Python 路径
  useEmbeddedPython: boolean; // 是否使用嵌入式 Python
  defaultChipModule: string;
  numThreads: number;
  customBoardSearchPath?: string;
  selectedSerialPort?: string; // 记忆选择的串口
  sdkConfigs: SdkConfig[]; // SDK配置数组
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
