import * as vscode from 'vscode';
import { 
  SerialMonitorExtension, 
  SerialMonitorApiV1, 
  SerialFilter, 
  SerialOptions 
} from '../types/serialMonitor';

/**
 * 串口监听器服务
 * 负责管理 eclipse-cdt.serial-monitor 扩展的串口监听功能
 */
export class SerialMonitorService {
  private static instance: SerialMonitorService;
  private serialMonitorApi: SerialMonitorApiV1 | undefined;
  private currentSerialHandle: string | undefined;
  private defaultBaudRate = 1000000;
  private lastUsedSerialPort: string | undefined; // 记住上次使用的串口
  private lastUsedBaudRate: number | undefined; // 记住上次使用的波特率

  private constructor() {}

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
      // 获取 eclipse-cdt.serial-monitor 扩展
      const extension = vscode.extensions.getExtension('eclipse-cdt.serial-monitor');
      
      if (!extension) {
        vscode.window.showErrorMessage('Serial Monitor 扩展未安装');
        return;
      }

      if (!extension.isActive) {
        // 激活扩展
        const activated = await extension.activate() as SerialMonitorExtension;
        this.serialMonitorApi = activated.getApi(1);
      } else {
        const activated = extension.exports as SerialMonitorExtension;
        this.serialMonitorApi = activated.getApi(1);
      }

      if (!this.serialMonitorApi) {
        vscode.window.showErrorMessage('无法获取 Serial Monitor API');
      }
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
      if (!this.serialMonitorApi) {
        await this.initialize();
      }

      if (!this.serialMonitorApi) {
        return false;
      }

      // 构建选项
      const options: SerialOptions = {
        baudRate: baudRate || this.defaultBaudRate
      };

      // 构建过滤器（如果提供了串口路径）
      const filter: SerialFilter | undefined = serialPort ? { path: serialPort } : undefined;

      // 打开串口监听器
      this.currentSerialHandle = await this.serialMonitorApi.openSerial(
        filter,
        options,
        'SiFli Device Monitor'
      );

      if (this.currentSerialHandle) {
        console.log(`串口监听器已打开: ${this.currentSerialHandle}`);
        // 记住当前使用的配置
        this.lastUsedSerialPort = serialPort;
        this.lastUsedBaudRate = baudRate || this.defaultBaudRate;
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
   * 通过查找并关闭相关的终端来释放串口资源
   */
  public async closeSerialMonitor(): Promise<boolean> {
    try {
      if (!this.currentSerialHandle || !this.serialMonitorApi) {
        return true;
      }

      // 查找并关闭相关的终端
      const terminals = vscode.window.terminals;
      let closedAny = false;
      
      for (const terminal of terminals) {
        // 检查终端名称是否包含串口监视器相关的关键词
        if (this.isSerialMonitorTerminal(terminal)) {
          console.log(`正在关闭串口监视器终端: ${terminal.name}`);
          terminal.dispose();
          closedAny = true;
        }
      }

      if (closedAny) {
        console.log('已关闭串口监视器相关终端');
        // 给一点时间让资源释放
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 清除当前句柄，标记为已关闭
      this.currentSerialHandle = undefined;
      console.log('串口监听器已关闭');
      
      return true;
    } catch (error) {
      console.error('关闭串口监听器失败:', error);
      // 即使出错也清除句柄
      this.currentSerialHandle = undefined;
      return false;
    }
  }

  /**
   * 判断终端是否是串口监视器相关的终端
   */
  private isSerialMonitorTerminal(terminal: vscode.Terminal): boolean {
    const terminalName = terminal.name;
    
    // 检查终端名称中是否包含我们的串口监视器标识
    return terminalName.includes('SiFli Device Monitor');
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
        // 尝试显示面板
        setTimeout(async () => {
          await this.revealSerialMonitor();
        }, 500);
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
      if (!this.currentSerialHandle || !this.serialMonitorApi) {
        return false;
      }

      return await this.serialMonitorApi.revealSerial(this.currentSerialHandle);
    } catch (error) {
      console.error('显示串口监听器面板失败:', error);
      return false;
    }
  }

  /**
   * 检查是否有活动的串口监听器
   */
  public hasActiveMonitor(): boolean {
    return !!this.currentSerialHandle;
  }

  /**
   * 获取当前串口句柄
   */
  public getCurrentHandle(): string | undefined {
    return this.currentSerialHandle;
  }

  /**
   * 设置默认波特率
   */
  public setDefaultBaudRate(baudRate: number): void {
    this.defaultBaudRate = baudRate;
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
    this.currentSerialHandle = undefined;
    this.lastUsedSerialPort = undefined;
    this.lastUsedBaudRate = undefined;
    console.log('串口监听器配置已重置');
  }

  /**
   * 检查是否有上次使用的配置可以恢复
   */
  public canResume(): boolean {
    return !!(this.lastUsedSerialPort || this.lastUsedBaudRate) && !this.currentSerialHandle;
  }
}
