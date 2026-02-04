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
    this.sdkManageBtn.tooltip = vscode.l10n.t('Manage SiFli SDK installation');
    this.sdkManageBtn.command = CMD_PREFIX + 'manageSiFliSdk';
    this.sdkManageBtn.show();
    context.subscriptions.push(this.sdkManageBtn);

    // SDK 版本切换按钮
    this.currentSdkVersionStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      101
    );
    this.currentSdkVersionStatusItem.text = vscode.l10n.t('SDK: {0}', vscode.l10n.t('N/A'));
    this.currentSdkVersionStatusItem.tooltip = vscode.l10n.t('Click to switch SiFli SDK version');
    this.currentSdkVersionStatusItem.command = CMD_PREFIX + 'switchSdkVersion';
    this.currentSdkVersionStatusItem.show();
    context.subscriptions.push(this.currentSdkVersionStatusItem);

    // 显示当前板卡的状态栏项
    this.currentBoardStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.currentBoardStatusItem.text = vscode.l10n.t('$(circuit-board) SiFli Board: {0}', vscode.l10n.t('N/A'));
    this.currentBoardStatusItem.command = CMD_PREFIX + 'selectChipModule';
    this.currentBoardStatusItem.show();
    context.subscriptions.push(this.currentBoardStatusItem);

    // 显示当前串口的状态栏项
    this.currentSerialPortStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    this.currentSerialPortStatusItem.text = vscode.l10n.t('$(plug) COM: {0}', vscode.l10n.t('N/A'));
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
    const notAvailable = vscode.l10n.t('N/A');
    const notSelected = vscode.l10n.t('Not selected');

    if (this.compileBtn) {
      this.compileBtn.tooltip = vscode.l10n.t('Run SiFli build');
    }

    if (this.rebuildBtn) {
      this.rebuildBtn.tooltip = vscode.l10n.t('Clean and run SiFli build');
    }

    if (this.cleanBtn) {
      this.cleanBtn.tooltip = vscode.l10n.t(
        'Delete SiFli build cache ({0})',
        selectedBoardName || notAvailable
      );
    }

    if (this.downloadBtn) {
      this.downloadBtn.tooltip = vscode.l10n.t(
        'Run SiFli download (current board: {0})',
        selectedBoardName || notSelected
      );
    }

    if (this.menuconfigBtn) {
      this.menuconfigBtn.tooltip = vscode.l10n.t('Open SiFli Menuconfig');
    }

    if (this.deviceMonitorBtn) {
      this.deviceMonitorBtn.tooltip = vscode.l10n.t('Monitor device - open serial monitor');
    }

    if (this.currentBoardStatusItem) {
      this.currentBoardStatusItem.text = vscode.l10n.t(
        '$(circuit-board) SiFli Board: {0} (J{1})',
        selectedBoardName || notAvailable,
        String(numThreads)
      );
      this.currentBoardStatusItem.tooltip = vscode.l10n.t(
        'Current SiFli board: {0}\nBuild threads: J{1}\nClick to change board or threads',
        selectedBoardName || notSelected,
        String(numThreads)
      );
    }

    if (this.currentSerialPortStatusItem) {
      // 获取用于显示的串口名称
      const displayPortName = selectedSerialPort
        ? SerialPortService.getDisplayPortName(selectedSerialPort)
        : notAvailable;
      
      this.currentSerialPortStatusItem.text = vscode.l10n.t('$(plug) COM: {0}', displayPortName);
      this.currentSerialPortStatusItem.tooltip = vscode.l10n.t(
        'Current serial port: {0}\nDownload baud rate: {1}\nMonitor baud rate: {2}\nClick to configure serial port',
        selectedSerialPort || notSelected,
        String(this.serialPortService.downloadBaudRate),
        String(this.serialPortService.monitorBaudRate)
      );
    }

    if (this.sdkManageBtn) {
      this.sdkManageBtn.tooltip = vscode.l10n.t('Manage SiFli SDK installation');
    }

    if (this.currentSdkVersionStatusItem) {
      const sdkVersionText = currentSdk ? currentSdk.version : notAvailable;
      this.currentSdkVersionStatusItem.text = vscode.l10n.t('SDK: {0}', sdkVersionText);
      this.currentSdkVersionStatusItem.tooltip = vscode.l10n.t(
        'Current SiFli SDK version: {0}\nClick to switch SDK version',
        sdkVersionText
      );
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
        vscode.window.showInformationMessage(vscode.l10n.t('Device monitor started.'));
      } else {
        vscode.window.showWarningMessage(vscode.l10n.t('Device monitor failed to start or was canceled.'));
      }
    } catch (error) {
      console.error('打开设备监视器失败:', error);
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to open device monitor: {0}', String(error)));
    }
  }

  /**
   * 关闭设备监视器
   */
  public async closeDeviceMonitor(): Promise<void> {
    try {
      const success = await this.serialMonitorService.closeSerialMonitor();
      
      if (success) {
        vscode.window.showInformationMessage(vscode.l10n.t('Device monitor closed.'));
      } else {
        vscode.window.showWarningMessage(vscode.l10n.t('Failed to close device monitor.'));
      }
    } catch (error) {
      console.error('关闭设备监视器失败:', error);
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to close device monitor: {0}', String(error)));
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
          vscode.window.showInformationMessage(
            vscode.l10n.t('Download completed. Serial monitor reopened.')
          );
        } else {
          console.warn('自动恢复串口监视器失败');
          vscode.window.showWarningMessage(
            vscode.l10n.t(
              'Download completed, but failed to auto-restore the serial monitor. You can reopen it from the monitor button.'
            )
          );
        }
      }
    } catch (error) {
      console.error('处理下载后操作失败:', error);
      vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Download completed, but an error occurred while restoring the serial monitor. You can reopen it from the monitor button.'
        )
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
