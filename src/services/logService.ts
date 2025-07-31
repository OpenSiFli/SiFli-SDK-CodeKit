import * as vscode from 'vscode';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export class LogService {
  private static instance: LogService;
  private outputChannel: vscode.OutputChannel;
  private logLevel: LogLevel = LogLevel.INFO;

  // ANSI 颜色代码
  private readonly colors = {
    reset: '\x1b[0m',
    debug: '\x1b[90m',    // 灰色 (暗灰)
    info: '\x1b[36m',     // 青色
    warn: '\x1b[33m',     // 黄色
    error: '\x1b[31m',    // 红色
    timestamp: '\x1b[90m' // 时间戳用灰色
  };

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('SiFli SDK CodeKit', "log");
  }

  public static getInstance(): LogService {
    if (!LogService.instance) {
      LogService.instance = new LogService();
    }
    return LogService.instance;
  }

  /**
   * 设置日志级别
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * 获取输出通道
   */
  public getOutputChannel(): vscode.OutputChannel {
    return this.outputChannel;
  }

  /**
   * 格式化时间戳
   */
  private getTimestamp(): string {
    const now = new Date();
    return now.toLocaleTimeString('zh-CN', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) + '.' + now.getMilliseconds().toString().padStart(3, '0');
  }

  /**
   * 通用日志方法
   */
  private log(level: LogLevel, levelName: string, message: string, ...args: any[]): void {
    if (level < this.logLevel) {
      return;
    }

    const timestamp = this.getTimestamp();
    const formattedMessage = args.length > 0 
      ? `${message} ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ')}`
      : message;
    
    const logEntry = `${timestamp} [${levelName}] ${formattedMessage}`;
    
    // 输出到 VS Code 输出通道
    this.outputChannel.appendLine(logEntry);
    
    // 同时输出到开发者控制台（开发环境可见）
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logEntry);
        break;
      case LogLevel.INFO:
        console.info(logEntry);
        break;
      case LogLevel.WARN:
        console.warn(logEntry);
        break;
      case LogLevel.ERROR:
        console.error(logEntry);
        break;
    }
  }

  /**
   * 调试级别日志
   */
  public debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, 'debug', message, ...args);
  }

  /**
   * 信息级别日志
   */
  public info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, 'info', message, ...args);
  }

  /**
   * 警告级别日志
   */
  public warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, 'warn', message, ...args);
  }

  /**
   * 错误级别日志
   */
  public error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, 'error', message, ...args);
  }

  /**
   * 显示输出通道
   */
  public show(preserveFocus?: boolean): void {
    this.outputChannel.show(preserveFocus);
  }

  /**
   * 清空输出通道
   */
  public clear(): void {
    this.outputChannel.clear();
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    this.outputChannel.dispose();
  }
}
