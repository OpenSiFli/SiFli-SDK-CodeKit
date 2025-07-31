import * as vscode from 'vscode';
import { SerialPort as SerialPortAPI } from 'serialport';
import { SerialPort } from '../types';
import { ConfigService } from './configService';
import { LogService } from './logService';

export class SerialPortService {
  private static instance: SerialPortService;
  private _selectedSerialPort: string | null = null;
  private configService: ConfigService;
  private logService: LogService;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.logService = LogService.getInstance();
  }

  public static getInstance(): SerialPortService {
    if (!SerialPortService.instance) {
      SerialPortService.instance = new SerialPortService();
    }
    return SerialPortService.instance;
  }

  public get selectedSerialPort(): string | null {
    return this._selectedSerialPort;
  }

  /**
   * 初始化串口服务，检查并恢复之前保存的串口
   */
  public async initialize(): Promise<void> {
    this.logService.info('Initializing serial port service...');
    
    // 从配置中获取上次选择的串口
    const savedPort = this.configService.config.selectedSerialPort;
    if (savedPort) {
      this.logService.debug(`Checking saved serial port: ${savedPort}`);
      
      // 检查保存的串口是否仍然可用
      const isAvailable = await this.validateSerialPort(savedPort);
      if (isAvailable) {
        this._selectedSerialPort = savedPort;
        this.logService.info(`Restored serial port: ${savedPort}`);
      } else {
        this.logService.warn(`Saved serial port ${savedPort} is no longer available, clearing selection`);
        // 清除无效的串口配置
        await this.configService.updateConfigValue('selectedSerialPort', undefined);
        this._selectedSerialPort = null;
      }
    } else {
      this.logService.debug('No saved serial port found');
    }
  }

  public set selectedSerialPort(port: string | null) {
    this._selectedSerialPort = port;
  }

  /**
   * 获取可用的串口列表
   */
  public async getSerialPorts(): Promise<SerialPort[]> {
    try {
      const ports = await SerialPortAPI.list();
      
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
        pnpId: port.pnpId,
        locationId: port.locationId,
        productId: port.productId,
        vendorId: port.vendorId
      }));
    } catch (error) {
      console.error(`[SerialPortService] Error getting serial ports: ${error}`);
      return [];
    }
  }

  /**
   * 显示串口选择对话框
   */
  public async selectSerialPort(): Promise<string | undefined> {
    try {
      const ports = await this.getSerialPorts();
      
      if (ports.length === 0) {
        vscode.window.showWarningMessage('未检测到可用的串口设备。请检查设备连接。');
        return undefined;
      }

      const portItems = ports.map(port => ({
        label: port.path,
        description: port.manufacturer || '',
        detail: port.serialNumber || port.pnpId || ''
      }));

      const selectedPort = await vscode.window.showQuickPick(portItems, {
        placeHolder: '选择串口设备',
        canPickMany: false
      });

      if (selectedPort) {
        this._selectedSerialPort = selectedPort.label;
        // 保存选择的串口到配置
        await this.configService.updateConfigValue('selectedSerialPort', selectedPort.label);
        this.logService.info(`Serial port selected and saved: ${selectedPort.label}`);
        vscode.window.showInformationMessage(`已选择串口: ${selectedPort.label}`);
        return selectedPort.label;
      }

      return undefined;
    } catch (error) {
      console.error('[SerialPortService] Error in selectSerialPort:', error);
      vscode.window.showErrorMessage(`选择串口时发生错误: ${error}`);
      return undefined;
    }
  }

  /**
   * 验证串口是否可用
   */
  public async validateSerialPort(portPath: string): Promise<boolean> {
    try {
      const ports = await this.getSerialPorts();
      return ports.some(port => port.path === portPath);
    } catch (error) {
      console.error(`[SerialPortService] Error validating serial port ${portPath}:`, error);
      return false;
    }
  }
}
