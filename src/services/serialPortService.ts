import * as vscode from 'vscode';
import { SerialPort as SerialPortAPI } from 'serialport';
import { SerialPort } from '../types';

export class SerialPortService {
  private static instance: SerialPortService;
  private _selectedSerialPort: string | null = null;

  private constructor() {}

  public static getInstance(): SerialPortService {
    if (!SerialPortService.instance) {
      SerialPortService.instance = new SerialPortService();
    }
    return SerialPortService.instance;
  }

  public get selectedSerialPort(): string | null {
    return this._selectedSerialPort;
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
