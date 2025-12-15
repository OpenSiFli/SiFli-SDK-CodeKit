import * as vscode from 'vscode';
import * as path from 'path';
import { SerialPort as SerialPortAPI } from 'serialport';
import { SerialPort } from '../types';
import { ConfigService } from './configService';
import { LogService } from './logService';
import { WorkspaceStateService } from './workspaceStateService';

export class SerialPortService {
  private static instance: SerialPortService;
  private _selectedSerialPort: string | null = null;
  private _downloadBaudRate: number = 1000000; // 默认下载波特率
  private _monitorBaudRate: number = 1000000; // 默认监视波特率
  private configService: ConfigService;
  private logService: LogService;
  private workspaceStateService: WorkspaceStateService;

  // 可选的波特率
  private static readonly BAUD_RATES = [1000000, 115200, 1500000, 2000000, 3000000, 6000000];

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.logService = LogService.getInstance();
    this.workspaceStateService = WorkspaceStateService.getInstance();
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

  public get downloadBaudRate(): number {
    return this._downloadBaudRate;
  }

  public get monitorBaudRate(): number {
    return this._monitorBaudRate;
  }

  public set downloadBaudRate(baudRate: number) {
    this._downloadBaudRate = baudRate;
    // 异步保存到 workspaceState
    this.workspaceStateService.setDownloadBaudRate(baudRate).catch(err => {
      this.logService.error(`Failed to save download baud rate: ${err}`);
    });
  }

  public set monitorBaudRate(baudRate: number) {
    this._monitorBaudRate = baudRate;
    // 异步保存到 workspaceState
    this.workspaceStateService.setMonitorBaudRate(baudRate).catch(err => {
      this.logService.error(`Failed to save monitor baud rate: ${err}`);
    });
  }

  /**
   * 初始化串口服务，检查并恢复之前保存的配置
   */
  public async initialize(): Promise<void> {
    this.logService.info('Initializing serial port service...');
    
    // 从 workspaceState 中获取上次选择的串口
    const savedPort = this.workspaceStateService.getSelectedSerialPort();
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
        await this.workspaceStateService.setSelectedSerialPort('');
        this._selectedSerialPort = null;
      }
    } else {
      this.logService.debug('No saved serial port found');
    }

    // 从 workspaceState 中恢复波特率设置
    this._downloadBaudRate = this.workspaceStateService.getDownloadBaudRate();
    this._monitorBaudRate = this.workspaceStateService.getMonitorBaudRate();
    this.logService.debug(`Restored baud rates: download=${this._downloadBaudRate}, monitor=${this._monitorBaudRate}`);
  }

  public set selectedSerialPort(port: string | null) {
    this._selectedSerialPort = port;
    // 异步保存到 workspaceState
    this.workspaceStateService.setSelectedSerialPort(port || '').catch(err => {
      this.logService.error(`Failed to save selected serial port: ${err}`);
    });
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
   * 显示串口选择对话框，包括串口、下载波特率和监视波特率的选择
   */
  public async selectPort(): Promise<{ port?: string; downloadBaud?: number; monitorBaud?: number } | undefined> {
    try {
      // 第一步：选择串口
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

      if (!selectedPort) {
        return undefined;
      }

      // 第二步：选择下载波特率
      const downloadBaudItems = SerialPortService.BAUD_RATES.map(baud => ({
        label: baud.toString(),
        // description: baud === this._downloadBaudRate ? '(当前)' : '',
        detail: `下载波特率: ${baud}`
      }));

      const selectedDownloadBaud = await vscode.window.showQuickPick(downloadBaudItems, {
        placeHolder: `选择下载波特率 (当前: ${this._downloadBaudRate})`,
        canPickMany: false
      });

      if (!selectedDownloadBaud) {
        return undefined;
      }

      // 第三步：选择监视波特率
      const monitorBaudItems = SerialPortService.BAUD_RATES.map(baud => ({
        label: baud.toString(),
        // description: baud === this._monitorBaudRate ? '(当前)' : '',
        detail: `监视波特率: ${baud}`
      }));

      const selectedMonitorBaud = await vscode.window.showQuickPick(monitorBaudItems, {
        placeHolder: `选择监视波特率 (当前: ${this._monitorBaudRate})`,
        canPickMany: false
      });

      if (!selectedMonitorBaud) {
        return undefined;
      }

      // 应用选择的配置
      const port = selectedPort.label;
      const downloadBaud = parseInt(selectedDownloadBaud.label);
      const monitorBaud = parseInt(selectedMonitorBaud.label);

      this._selectedSerialPort = port;
      this._downloadBaudRate = downloadBaud;
      this._monitorBaudRate = monitorBaud;

      // 保存配置到 workspaceState
      await this.workspaceStateService.setSelectedSerialPort(port);
      await this.workspaceStateService.setDownloadBaudRate(downloadBaud);
      await this.workspaceStateService.setMonitorBaudRate(monitorBaud);
      
      this.logService.info(`Port configuration updated: ${port}, download: ${downloadBaud}, monitor: ${monitorBaud}`);
      vscode.window.showInformationMessage(
        `已配置串口: ${port}\n下载波特率: ${downloadBaud}\n监视波特率: ${monitorBaud}`
      );

      return {
        port,
        downloadBaud,
        monitorBaud
      };
    } catch (error) {
      console.error('[SerialPortService] Error in selectPort:', error);
      vscode.window.showErrorMessage(`选择串口配置时发生错误: ${error}`);
      return undefined;
    }
  }

  /**
   * 保持兼容性的串口选择方法（仅选择串口）
   */
  public async selectSerialPort(): Promise<string | undefined> {
    const result = await this.selectPort();
    return result?.port;
  }

  /**
   * 获取可用的波特率列表
   */
  public static getBaudRates(): number[] {
    return [...SerialPortService.BAUD_RATES];
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

  /**
   * 工具函数：从完整的串口路径中提取用于状态栏显示的名称。
   * 兼容 Windows、Linux 和 macOS。
   * @param portPath 完整的串口路径，例如 'COM8' 或 '/dev/ttyUSB0'。
   * @returns 简化的名称，例如 '8' 或 'ttyUSB0'。
   */
  public static getDisplayPortName(portPath: string): string {
    // 检查是否为 Windows 的 COM 端口
    const comMatch = portPath.match(/COM(\d+)/i);
    if (comMatch && comMatch[1]) {
      return comMatch[1]; // 返回纯数字部分，例如 '8'
    }

    // 对于非 Windows 系统，返回路径的基名称
    return path.basename(portPath);
  }
}