export interface Board {
  name: string;
  path: string;
  type: 'sdk' | 'custom' | 'project_local';
}

export interface BoardDiscoveryResult {
  boards: Board[];
  sdkBoards: Board[];
  customBoards: Board[];
  projectLocalBoards: Board[];
}

/**
 * 写入 Flash 的文件信息
 */
export interface WriteFlashFile {
  /** 文件系统路径 */
  path: string;
  /** 目标地址（十六进制字符串，如 "0x12000000"） */
  address?: string;
}

/**
 * 写入 Flash 命令参数
 */
export interface WriteFlashCommand {
  /** 写入后是否验证 */
  verify?: boolean;
  /** 是否先擦除整个 Flash */
  erase_all?: boolean;
  /** 是否禁用压缩 */
  no_compress?: boolean;
  /** 要写入的文件列表 */
  files: WriteFlashFile[];
}

/**
 * sftool 参数配置接口
 * 基于 sftool CLI Configuration Schema，专注于 write_flash 命令
 */
export interface SftoolParam {
  /** 目标芯片类型 */
  chip: 'SF32LB52' | 'SF32LB56' | 'SF32LB58';
  /** 内存类型 */
  memory?: 'nor' | 'nand' | 'sd';
  /** 串口设备 */
  port?: string;
  /** 串口波特率 */
  baud?: number;
  /** 连接芯片前的操作 */
  before?: 'no_reset' | 'soft_reset' | 'default_reset';
  /** sftool 完成后的操作 */
  after?: 'no_reset' | 'soft_reset' | 'default_reset';
  /** 连接尝试次数 */
  connect_attempts?: number;
  /** 是否启用兼容模式 */
  compat?: boolean;
  /** 写入 Flash 命令参数 */
  write_flash?: WriteFlashCommand;
  
  // 兼容旧版本字段
  /** @deprecated 使用 write_flash.files[0].path */
  load_file?: string;
  /** @deprecated 使用 write_flash.files[0].address */
  load_addr?: string;
  
  /** 其他未知字段 */
  [key: string]: any;
}
