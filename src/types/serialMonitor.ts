/**
 * 串口监视器扩展相关的类型定义
 */

export interface SerialMonitorExtension {
  getApi(version: 1): SerialMonitorApiV1;
  getApi(version: 2): SerialMonitorApiV2;
}

export interface SerialMonitorApiV1 {
  openSerial(portOrFilter?: SerialMonitorPort | SerialFilter, options?: SerialOptions, name?: string): Promise<string | undefined>;
  revealSerial(handle: string): Promise<boolean>;
  pauseSerial(handle: string): Promise<boolean>;
  resumeSerial(handle: string): Promise<boolean>;
}

export interface SerialMonitorApiV2 extends SerialMonitorApiV1 {
  listPorts(): Promise<SerialInfo[]>;
}

export interface SerialFilter {
  serialNumber?: string;
  vendorId?: number;
  productId?: number;
  path?: string;
}

export interface SerialInfo {
  path?: string;
  serialNumber?: string;
  manufacturer?: string;
  productId?: string;
  vendorId?: string;
}

export interface SerialOptions {
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
  flowControl?: boolean;
}

export interface SerialMonitorPort {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  productId?: string;
  vendorId?: string;
}
