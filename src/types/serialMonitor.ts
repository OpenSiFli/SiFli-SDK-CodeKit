/**
 * 内置串口监视器相关的类型定义
 * 这些类型定义用于内置串口监视器实现
 */

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
}

export interface SerialConnectionOptions {
  baudRate: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
}

export interface SerialConnectionStatus {
  isConnected: boolean;
  port: string;
  baudRate: number;
}
