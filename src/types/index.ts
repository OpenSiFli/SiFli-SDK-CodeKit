export * from './config';
export * from './board';
export * from './sdk';
// export * from './serialMonitor'; // 暂时注释掉避免 SerialPort 类型冲突

export type TaskName = 
  | 'SiFli: Build'
  | 'SiFli: Download' 
  | 'SiFli: Menuconfig'
  | 'SiFli: Clean'
  | 'SiFli: Rebuild';

export type CommandId = 
  | 'extension.compile'
  | 'extension.rebuild'
  | 'extension.clean'
  | 'extension.download'
  | 'extension.menuconfig'
  | 'extension.selectChipModule'
  | 'extension.selectDownloadPort'
  | 'extension.manageSiFliSdk'
  | 'extension.switchSdkVersion'
  | 'extension.openDeviceMonitor';
