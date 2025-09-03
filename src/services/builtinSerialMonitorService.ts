import * as vscode from 'vscode';
import { SerialPort } from 'serialport';

/**
 * 串口设备抽象基类
 */
abstract class SerialDevice {
  protected _onData = new vscode.EventEmitter<string>();
  public readonly onData = this._onData.event;

  protected _onEnd = new vscode.EventEmitter<void>();
  public readonly onEnd = this._onEnd.event;

  public abstract handle: string;
  public abstract name: string;
  public currentOptions: SerialOptions | undefined;

  public abstract open(options: SerialOptions): Promise<void>;
  public abstract send(data: string): Promise<void>;
  public abstract close(): Promise<void>;
  public abstract pause(): Promise<void>;
  public abstract resume(): Promise<void>;
}

/**
 * 桌面串口设备实现
 */
class DesktopSerialDevice extends SerialDevice {
  private serialPort: SerialPort | undefined;
  private decoder = new TextDecoder();

  constructor(private portInfo: { path: string; manufacturer?: string; serialNumber?: string }) {
    super();
  }

  public get handle(): string {
    return this.portInfo.path;
  }

  public get name(): string {
    const info = this.portInfo;
    return (info.manufacturer || info.serialNumber) 
      ? `${info.path} (${info.manufacturer || info.serialNumber})` 
      : info.path;
  }

  public async open(options: SerialOptions): Promise<void> {
    this.currentOptions = options;
    const dataBits = options.dataBits as 5 | 6 | 7 | 8 | undefined;
    const stopBits = options.stopBits as 1 | 1.5 | 2 | undefined;

    this.serialPort = new SerialPort({
      path: this.portInfo.path,
      baudRate: options.baudRate,
      dataBits,
      parity: options.parity,
      stopBits
    });

    this.serialPort.on('end', () => this._onEnd.fire());
    this.serialPort.on('close', () => this._onEnd.fire());
    this.serialPort.on('data', (data: Buffer) => this.emit(data));
    this.serialPort.on('error', (error) => {
      this._onData.fire(`Error: ${error.message}`);
      this.close();
    });
    this.serialPort.on('open', () => {
      if (this.serialPort) {
        // Set control signals: DTR and RTS to false to prevent device reset
        this.serialPort.set({
          dtr: false,
          rts: false
        });
      }
    });
  }

  public async send(data: string): Promise<void> {
    if (this.serialPort && this.serialPort.isOpen) {
      this.serialPort.write(data);
    }
  }

  public async close(): Promise<void> {
    if (this.serialPort && this.serialPort.isOpen) {
      this.serialPort.close();
    }
  }

  private emit(data: Buffer): void {
    this._onData.fire(this.decoder.decode(data));
  }

  public async pause(): Promise<void> {
    if (this.serialPort) {
      this.serialPort.pause();
    }
  }

  public async resume(): Promise<void> {
    if (this.serialPort) {
      this.serialPort.resume();
    }
  }
}

/**
 * 串口终端 PTY 实现
 */
class SerialTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  public readonly onDidWrite = this.writeEmitter.event;
  
  private closeEmitter = new vscode.EventEmitter<number>();
  public readonly onDidClose = this.closeEmitter.event;
  
  public closed = false;

  constructor(
    private serialDevice: SerialDevice, 
    private options: SerialOptions
  ) {}

  public async open(_initialDimensions?: vscode.TerminalDimensions): Promise<void> {
    // 监听串口数据
    this.serialDevice.onData(data => this.writeOutput(data));
    
    // 监听串口关闭
    this.serialDevice.onEnd(() => {
      if (!this.closed) {
        this.closed = true;
        this.closeEmitter.fire(0);
      }
    });

    // 打开串口
    await this.serialDevice.open(this.options);
    this.writeLine(`📡 Connected to ${this.serialDevice.name} @ ${this.options.baudRate} baud`);
    this.writeLine(`📝 Type data to send to device. Press Ctrl+C to disconnect.`);
  }

  public close(): void {
    this.serialDevice.close();
  }

  public handleInput(data: string): void {
    // 处理特殊键
    if (data === '\x03') { // Ctrl+C
      this.writeLine('🔌 Disconnecting...');
      this.close();
      return;
    }

    // 直接发送到串口，不回显到终端
    this.serialDevice.send(data);
  }

  private writeLine(message: string): void {
    this.writeOutput(`${message}\n`);
  }

  private writeOutput(message: string): void {
    // VSCode 终端需要回车符处理
    const output = message.replace(/\r/g, '').replace(/\n/g, '\r\n');
    this.writeEmitter.fire(output);
  }

  public setDimensions(_dimensions: vscode.TerminalDimensions): void {
    // 处理终端尺寸变化（如果需要）
  }
}

/**
 * 串口选项接口
 */
interface SerialOptions {
  baudRate: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
}

/**
 * 内置串口监视器服务
 */
export class BuiltinSerialMonitorService {
  private static instance: BuiltinSerialMonitorService;
  private serialHandles = new Map<string, SerialDevice>();
  private serialTerminals = new Map<SerialDevice, vscode.Terminal>();
  private defaultBaudRate = 1000000;

  private constructor() {}

  public static getInstance(): BuiltinSerialMonitorService {
    if (!BuiltinSerialMonitorService.instance) {
      BuiltinSerialMonitorService.instance = new BuiltinSerialMonitorService();
    }
    return BuiltinSerialMonitorService.instance;
  }

  /**
   * 列出可用的串口
   */
  public async listSerialPorts(): Promise<{ path: string; manufacturer?: string; serialNumber?: string }[]> {
    try {
      const ports = await SerialPort.list();
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber
      }));
    } catch (error) {
      console.error('Failed to list serial ports:', error);
      return [];
    }
  }

  /**
   * 打开串口监视器
   */
  public async openSerialMonitor(
    portPath?: string,
    baudRate: number = this.defaultBaudRate,
    title: string = 'SiFli Serial Monitor'
  ): Promise<string | undefined> {
    try {
      let selectedPortInfo;
      
      if (portPath) {
        // 使用指定端口
        selectedPortInfo = { path: portPath };
      } else {
        // 让用户选择端口
        const ports = await this.listSerialPorts();
        if (ports.length === 0) {
          vscode.window.showErrorMessage('No serial ports found');
          return undefined;
        }

        const portItems = ports.map(port => ({
          label: port.path,
          description: port.manufacturer || 'Unknown',
          detail: port.serialNumber ? `Serial: ${port.serialNumber}` : ''
        }));

        const selected = await vscode.window.showQuickPick(portItems, {
          placeHolder: 'Select a serial port to monitor'
        });

        if (!selected) {
          return undefined;
        }

        const selectedPort = ports.find(p => p.path === selected.label);
        if (!selectedPort) {
          return undefined;
        }

        selectedPortInfo = selectedPort;
      }

      // 检查是否已经有连接
      const device = this.getExistingDevice(selectedPortInfo.path);
      if (device) {
        const existingTerminal = this.serialTerminals.get(device);
        if (existingTerminal && existingTerminal.exitStatus === undefined) {
          existingTerminal.show();
          return device.handle;
        }
      }

      // 创建新设备和终端
      const serialDevice = new DesktopSerialDevice(selectedPortInfo);
      const success = await this.openSerialPort(serialDevice, {
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      }, title);

      if (success) {
        const handle = serialDevice.handle;
        this.serialHandles.set(handle, serialDevice);
        return handle;
      }

      return undefined;
    } catch (error) {
      console.error('Failed to open serial monitor:', error);
      vscode.window.showErrorMessage(`Failed to open serial monitor: ${error}`);
      return undefined;
    }
  }

  /**
   * 打开串口设备
   */
  private async openSerialPort(
    serialDevice: SerialDevice, 
    options: SerialOptions, 
    terminalName: string
  ): Promise<boolean> {
    try {
      const pty = new SerialTerminal(serialDevice, options);
      
      // 监听终端关闭事件
      pty.onDidClose(() => {
        this.cleanup(serialDevice);
      });

      // 创建终端
      const terminal = vscode.window.createTerminal({ 
        name: `${terminalName} (${serialDevice.name})`, 
        pty 
      });
      
      this.serialTerminals.set(serialDevice, terminal);
      terminal.show();

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Error';
      vscode.window.showErrorMessage(message);
      return false;
    }
  }

  /**
   * 关闭串口监视器
   */
  public async closeSerialMonitor(connectionId: string): Promise<boolean> {
    try {
      const device = this.serialHandles.get(connectionId);
      if (!device) {
        return true;
      }

      await device.close();
      this.cleanup(device);
      this.serialHandles.delete(connectionId);
      
      return true;
    } catch (error) {
      console.error('Failed to close serial monitor:', error);
      return false;
    }
  }

  /**
   * 关闭所有串口监视器
   */
  public async closeAllSerialMonitors(): Promise<void> {
    const handles = Array.from(this.serialHandles.keys());
    for (const handle of handles) {
      await this.closeSerialMonitor(handle);
    }
  }

  /**
   * 获取现有设备
   */
  private getExistingDevice(portPath: string): SerialDevice | undefined {
    return Array.from(this.serialHandles.values()).find(device => device.handle === portPath);
  }

  /**
   * 清理设备和终端
   */
  private cleanup(serialDevice: SerialDevice): void {
    const terminal = this.serialTerminals.get(serialDevice);
    if (terminal && terminal.exitStatus === undefined) {
      terminal.dispose();
    }
    this.serialTerminals.delete(serialDevice);
  }

  /**
   * 获取活动连接数量
   */
  public getActiveConnectionCount(): number {
    return this.serialTerminals.size;
  }

  /**
   * 设置默认波特率
   */
  public setDefaultBaudRate(baudRate: number): void {
    this.defaultBaudRate = baudRate;
  }
}
