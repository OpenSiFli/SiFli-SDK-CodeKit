export interface SiFliConfig {
  powershellPath?: string;
  sifliSdkExportScriptPath?: string;
  installedSdkPaths: string[];
  defaultChipModule: string;
  numThreads: number;
  customBoardSearchPath?: string;
  selectedSerialPort?: string; // 记忆选择的串口
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
