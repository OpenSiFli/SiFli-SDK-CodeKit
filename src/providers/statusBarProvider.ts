import * as vscode from 'vscode';
import { CMD_PREFIX } from '../constants';
import { ConfigService } from '../services/configService';
import { SerialPortService } from '../services/serialPortService';
import { SerialMonitorService } from '../services/serialMonitorService';
import { SifliSidebarManager } from './sifliSidebarProvider';

export class StatusBarProvider {
  private static instance: StatusBarProvider;
  private configService: ConfigService;
  private serialPortService: SerialPortService;
  private serialMonitorService: SerialMonitorService;
  
  // 状态栏按钮
  private compileBtn?: vscode.StatusBarItem;
  private rebuildBtn?: vscode.StatusBarItem;
  private cleanBtn?: vscode.StatusBarItem;
  private downloadBtn?: vscode.StatusBarItem;
  private menuconfigBtn?: vscode.StatusBarItem;
  private currentBoardStatusItem?: vscode.StatusBarItem;
  private sdkManageBtn?: vscode.StatusBarItem;
  private currentSerialPortStatusItem?: vscode.StatusBarItem;
  private currentSdkVersionStatusItem?: vscode.StatusBarItem;
  private deviceMonitorBtn?: vscode.StatusBarItem;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
    this.serialMonitorService = SerialMonitorService.getInstance();
  }

  public static getInstance(): StatusBarProvider {
    if (!StatusBarProvider.instance) {
      StatusBarProvider.instance = new StatusBarProvider();
    }
    return StatusBarProvider.instance;
  }

  /**
   * 初始化状态栏按钮
   */
  public initializeStatusBarItems(context: vscode.ExtensionContext): void {
    // SDK 管理按钮
    this.sdkManageBtn = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      102
    );
    this.sdkManageBtn.text = '$(cloud-download)';
    this.sdkManageBtn.tooltip = '管理 SiFli SDK 安装';
    this.sdkManageBtn.command = CMD_PREFIX + 'manageSiFliSdk';
    this.sdkManageBtn.show();
    context.subscriptions.push(this.sdkManageBtn);

    // SDK 版本切换按钮
    this.currentSdkVersionStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      101
    );
    this.currentSdkVersionStatusItem.text = 'SDK: N/A';
    this.currentSdkVersionStatusItem.tooltip = '点击切换 SiFli SDK 版本';
    this.currentSdkVersionStatusItem.command = CMD_PREFIX + 'switchSdkVersion';
    this.currentSdkVersionStatusItem.show();
    context.subscriptions.push(this.currentSdkVersionStatusItem);

    // 显示当前板卡的状态栏项
    this.currentBoardStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.currentBoardStatusItem.text = '$(circuit-board) SiFli Board: N/A';
    this.currentBoardStatusItem.command = CMD_PREFIX + 'selectChipModule';
    this.currentBoardStatusItem.show();
    context.subscriptions.push(this.currentBoardStatusItem);

    // 显示当前串口的状态栏项
    this.currentSerialPortStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    this.currentSerialPortStatusItem.text = '$(plug) COM: N/A';
    this.currentSerialPortStatusItem.command = CMD_PREFIX + 'selectPort';
    this.currentSerialPortStatusItem.show();
    context.subscriptions.push(this.currentSerialPortStatusItem);

    // 编译按钮
    this.compileBtn = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      98
    );
    this.compileBtn.text = '$(symbol-property)';
    this.compileBtn.command = CMD_PREFIX + 'compile';
    this.compileBtn.show();
    context.subscriptions.push(this.compileBtn);

    // 重新构建按钮
    this.rebuildBtn = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      97
    );
    this.rebuildBtn.text = '$(sync)';
    this.rebuildBtn.command = CMD_PREFIX + 'rebuild';
    this.rebuildBtn.show();
    context.subscriptions.push(this.rebuildBtn);

    // 清理按钮
    this.cleanBtn = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      96
    );
    this.cleanBtn.text = '$(trashcan)';
    this.cleanBtn.command = CMD_PREFIX + 'clean';
    this.cleanBtn.show();
    context.subscriptions.push(this.cleanBtn);

    // 下载按钮
    this.downloadBtn = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      95
    );
    this.downloadBtn.text = '$(symbol-event)';
    this.downloadBtn.command = CMD_PREFIX + 'download';
    this.downloadBtn.show();
    context.subscriptions.push(this.downloadBtn);

    // Menuconfig 按钮
    this.menuconfigBtn = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      94
    );
    this.menuconfigBtn.text = '$(settings-gear)';
    this.menuconfigBtn.command = CMD_PREFIX + 'menuconfig';
    this.menuconfigBtn.show();
    context.subscriptions.push(this.menuconfigBtn);

    // 设备监视按钮
    this.deviceMonitorBtn = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      93
    );
    this.deviceMonitorBtn.text = '$(device-desktop)';
    this.deviceMonitorBtn.command = CMD_PREFIX + 'openDeviceMonitor';
    this.deviceMonitorBtn.show();
    context.subscriptions.push(this.deviceMonitorBtn);

    this.updateStatusBarItems();
  }

  /**
   * 更新状态栏按钮的提示信息
   */
  public updateStatusBarItems(): void {
    const selectedBoardName = this.configService.getSelectedBoardName();
    const numThreads = this.configService.getNumThreads();
    const selectedSerialPort = this.serialPortService.selectedSerialPort;
    const currentSdk = this.configService.getCurrentSdk();

    if (this.compileBtn) {
      this.compileBtn.tooltip = '执行 SiFli 构建';
    }

    if (this.rebuildBtn) {
      this.rebuildBtn.tooltip = '清理并执行 SiFli 构建';
    }

    if (this.cleanBtn) {
      this.cleanBtn.tooltip = `删除 SiFli 构建缓存 (${selectedBoardName || 'N/A'})`;
    }

    if (this.downloadBtn) {
      this.downloadBtn.tooltip = `执行 SiFli 下载 (当前模组: ${selectedBoardName || '未选择'})`;
    }

    if (this.menuconfigBtn) {
      this.menuconfigBtn.tooltip = '打开 SiFli Menuconfig';
    }

    if (this.deviceMonitorBtn) {
      this.deviceMonitorBtn.tooltip = '监视设备 - 打开串口监听器';
    }

    if (this.currentBoardStatusItem) {
      this.currentBoardStatusItem.text = `$(circuit-board) SiFli Board: ${selectedBoardName || 'N/A'} (J${numThreads})`;
      this.currentBoardStatusItem.tooltip = `当前 SiFli 芯片模组: ${selectedBoardName || '未选择'}\\n编译线程数: J${numThreads}\\n点击切换芯片模组或修改线程数`;
    }

    if (this.currentSerialPortStatusItem) {
      // 获取用于显示的串口名称
      const displayPortName = selectedSerialPort
        ? SerialPortService.getDisplayPortName(selectedSerialPort)
        : 'N/A';
      
      this.currentSerialPortStatusItem.text = `$(plug) COM: ${displayPortName}`;
      this.currentSerialPortStatusItem.tooltip = `当前串口配置: ${selectedSerialPort || '未选择'}\\n下载波特率: ${this.serialPortService.downloadBaudRate}\\n监视波特率: ${this.serialPortService.monitorBaudRate}\\n点击配置串口`;
    }

    if (this.sdkManageBtn) {
      this.sdkManageBtn.tooltip = '管理 SiFli SDK 安装';
    }

    if (this.currentSdkVersionStatusItem) {
      const sdkVersionText = currentSdk ? currentSdk.version : 'N/A';
      this.currentSdkVersionStatusItem.text = `SDK: ${sdkVersionText}`;
      this.currentSdkVersionStatusItem.tooltip = `当前 SiFli SDK 版本: ${sdkVersionText}\\n点击切换 SDK 版本`;
    }

    // 同时更新侧边栏
    try {
      const sidebarManager = SifliSidebarManager.getInstance();
      sidebarManager.refresh();
    } catch (error) {
      // 忽略错误，可能侧边栏还未初始化
    }
  }

  /**
   * 打开设备监视器
   */
  public async openDeviceMonitor(): Promise<void> {
    try {
      // 初始化串口监视器服务
      await this.serialMonitorService.initialize();
      
      // 获取当前选择的串口
      const selectedSerialPort = this.serialPortService.selectedSerialPort;
      
      // 打开串口监听器
      const success = await this.serialMonitorService.openSerialMonitor(
        selectedSerialPort || undefined,
        this.serialPortService.monitorBaudRate
      );
      
      if (success) {
        vscode.window.showInformationMessage('设备监视器已启动');
      } else {
        vscode.window.showWarningMessage('设备监视器启动失败或已取消');
      }
    } catch (error) {
      console.error('打开设备监视器失败:', error);
      vscode.window.showErrorMessage(`打开设备监视器失败: ${error}`);
    }
  }

  /**
   * 在下载操作前处理串口监视器
   */
  public async handlePreDownloadOperation(): Promise<boolean> {
    try {
      if (this.serialMonitorService.hasActiveMonitor()) {
        console.log('检测到活动的串口监视器，正在关闭...');
        const closed = await this.serialMonitorService.closeSerialMonitor();
        if (closed) {
          console.log('串口监视器已关闭，可以开始下载操作');
          return true;
        } else {
          console.warn('关闭串口监视器失败，但继续下载操作');
          return true;
        }
      }
      return true;
    } catch (error) {
      console.error('处理下载前操作失败:', error);
      return true; // 即使失败也继续下载操作
    }
  }

  /**
   * 在下载操作后恢复串口监视器
   */
  public async handlePostDownloadOperation(): Promise<void> {
    try {
      // 检查是否可以恢复（有之前的配置且当前没有活动监视器）
      if (this.serialMonitorService.canResume()) {
        console.log('下载操作完成，正在恢复串口监视器...');
        const resumed = await this.serialMonitorService.resumeSerialMonitor();
        if (resumed) {
          console.log('串口监视器已恢复');
          vscode.window.showInformationMessage('下载完成，串口监视器已自动重新打开');
        } else {
          console.warn('自动恢复串口监视器失败');
          vscode.window.showWarningMessage(
            '下载完成，但自动恢复串口监视器失败。您可以手动点击监视器按钮重新打开。'
          );
        }
      }
    } catch (error) {
      console.error('处理下载后操作失败:', error);
      vscode.window.showWarningMessage(
        '下载完成，但恢复串口监视器时出现错误。您可以手动点击监视器按钮重新打开。'
      );
    }
  }

  /**
   * 清理所有状态栏按钮
   */
  public dispose(): void {
    this.compileBtn?.dispose();
    this.rebuildBtn?.dispose();
    this.cleanBtn?.dispose();
    this.downloadBtn?.dispose();
    this.menuconfigBtn?.dispose();
    this.deviceMonitorBtn?.dispose();
    this.currentSdkVersionStatusItem?.dispose();
    this.currentBoardStatusItem?.dispose();
    this.currentSerialPortStatusItem?.dispose();
    this.sdkManageBtn?.dispose();
  }
}
