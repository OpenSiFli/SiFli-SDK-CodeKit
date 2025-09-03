import * as vscode from 'vscode';
import { BuiltinSerialMonitorService } from './builtinSerialMonitorService';

/**
 * 串口监听器服务
 * 使用内置串口监视器实现，提供统一的串口监视功能
 */
export class SerialMonitorService {
  private static instance: SerialMonitorService;
  private builtinService: BuiltinSerialMonitorService;
  private currentConnectionId: string | undefined;
  private defaultBaudRate = 1000000;
  private lastUsedSerialPort: string | undefined;
  private lastUsedBaudRate: number | undefined;

  private constructor() {
    this.builtinService = BuiltinSerialMonitorService.getInstance();
  }

  public static getInstance(): SerialMonitorService {
    if (!SerialMonitorService.instance) {
      SerialMonitorService.instance = new SerialMonitorService();
    }
    return SerialMonitorService.instance;
  }

  /**
   * 初始化串口监听器服务
   */
  public async initialize(): Promise<void> {
    try {
      console.log('串口监听器服务已初始化（使用内置实现）');
    } catch (error) {
      console.error('初始化串口监听器服务失败:', error);
      vscode.window.showErrorMessage(`初始化串口监听器失败: ${error}`);
    }
  }

  /**
   * 打开串口监听器
   * @param serialPort 指定的串口路径，如果不提供则弹出选择对话框
   * @param baudRate 波特率，默认为 1000000
   */
  public async openSerialMonitor(serialPort?: string, baudRate?: number): Promise<boolean> {
    try {
      const actualBaudRate = baudRate || this.defaultBaudRate;
      
      this.currentConnectionId = await this.builtinService.openSerialMonitor(
        serialPort,
        actualBaudRate,
        'SiFli Device Monitor'
      );

      if (this.currentConnectionId) {
        console.log(`串口监听器已打开: ${this.currentConnectionId}`);
        // 记住当前使用的配置
        this.lastUsedSerialPort = serialPort;
        this.lastUsedBaudRate = actualBaudRate;
        return true;
      } else {
        console.log('用户取消了串口选择或打开失败');
        return false;
      }
    } catch (error) {
      console.error('打开串口监听器失败:', error);
      vscode.window.showErrorMessage(`打开串口监听器失败: ${error}`);
      return false;
    }
  }

  /**
   * 关闭当前串口监听器
   */
  public async closeSerialMonitor(): Promise<boolean> {
    try {
      if (!this.currentConnectionId) {
        return true;
      }

      const success = await this.builtinService.closeSerialMonitor(this.currentConnectionId);
      
      if (success) {
        console.log('串口监听器已关闭');
        this.currentConnectionId = undefined;
      }
      
      return success;
    } catch (error) {
      console.error('关闭串口监听器失败:', error);
      // 即使出错也清除连接ID
      this.currentConnectionId = undefined;
      return false;
    }
  }

  /**
   * 重新打开串口监听器（恢复）
   * 使用之前记录的串口和波特率配置重新打开
   */
  public async resumeSerialMonitor(): Promise<boolean> {
    try {
      // 如果没有之前的配置信息，无法恢复
      if (!this.lastUsedSerialPort && !this.lastUsedBaudRate) {
        console.log('没有之前的串口配置信息，无法自动恢复');
        return false;
      }

      console.log('正在重新打开串口监听器...');
      
      // 重新打开串口监听器
      const success = await this.openSerialMonitor(
        this.lastUsedSerialPort, 
        this.lastUsedBaudRate
      );
      
      if (success) {
        console.log('串口监听器已重新打开');
      } else {
        console.log('重新打开串口监听器失败');
      }
      
      return success;
    } catch (error) {
      console.error('恢复串口监听器失败:', error);
      return false;
    }
  }

  /**
   * 显示串口监听器面板
   */
  public async revealSerialMonitor(): Promise<boolean> {
    try {
      if (!this.currentConnectionId) {
        return false;
      }

      // 对于内置实现，终端会自动显示，这里返回 true
      console.log('串口监听器面板已显示');
      return true;
    } catch (error) {
      console.error('显示串口监听器面板失败:', error);
      return false;
    }
  }

  /**
   * 检查是否有活动的串口监听器
   */
  public hasActiveMonitor(): boolean {
    return !!this.currentConnectionId;
  }

  /**
   * 获取当前串口句柄
   */
  public getCurrentHandle(): string | undefined {
    return this.currentConnectionId;
  }

  /**
   * 设置默认波特率
   */
  public setDefaultBaudRate(baudRate: number): void {
    this.defaultBaudRate = baudRate;
    this.builtinService.setDefaultBaudRate(baudRate);
  }

  /**
   * 获取默认波特率
   */
  public getDefaultBaudRate(): number {
    return this.defaultBaudRate;
  }

  /**
   * 获取上次使用的串口配置
   */
  public getLastUsedConfig(): { port?: string; baudRate?: number } {
    return {
      port: this.lastUsedSerialPort,
      baudRate: this.lastUsedBaudRate
    };
  }

  /**
   * 重置配置（清除记录的串口信息）
   */
  public resetConfig(): void {
    this.currentConnectionId = undefined;
    this.lastUsedSerialPort = undefined;
    this.lastUsedBaudRate = undefined;
    console.log('串口监听器配置已重置');
  }

  /**
   * 检查是否有上次使用的配置可以恢复
   */
  public canResume(): boolean {
    return !!(this.lastUsedSerialPort || this.lastUsedBaudRate) && !this.currentConnectionId;
  }

  /**
   * 列出可用的串口
   */
  public async listSerialPorts(): Promise<{ path: string; manufacturer?: string; serialNumber?: string }[]> {
    return await this.builtinService.listSerialPorts();
  }

  /**
   * 关闭所有串口监视器
   */
  public async closeAllSerialMonitors(): Promise<void> {
    await this.builtinService.closeAllSerialMonitors();
    this.currentConnectionId = undefined;
  }

  /**
   * 获取活动连接数量
   */
  public getActiveConnectionCount(): number {
    return this.builtinService.getActiveConnectionCount();
  }
}
