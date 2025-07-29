import * as vscode from 'vscode';
import { CMD_PREFIX } from '../constants';
import { ConfigService } from '../services/configService';
import { SerialPortService } from '../services/serialPortService';

export class StatusBarProvider {
  private static instance: StatusBarProvider;
  private configService: ConfigService;
  private serialPortService: SerialPortService;
  
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

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
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
    this.currentSerialPortStatusItem.command = CMD_PREFIX + 'selectDownloadPort';
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

    if (this.currentBoardStatusItem) {
      this.currentBoardStatusItem.text = `$(circuit-board) SiFli Board: ${selectedBoardName || 'N/A'} (J${numThreads})`;
      this.currentBoardStatusItem.tooltip = `当前 SiFli 芯片模组: ${selectedBoardName || '未选择'}\\n编译线程数: J${numThreads}\\n点击切换芯片模组或修改线程数`;
    }

    if (this.currentSerialPortStatusItem) {
      this.currentSerialPortStatusItem.text = `$(plug) COM: ${selectedSerialPort || 'N/A'}`;
      this.currentSerialPortStatusItem.tooltip = `当前下载串口: ${selectedSerialPort || '未选择'}\\n点击选择串口`;
    }

    if (this.sdkManageBtn) {
      this.sdkManageBtn.tooltip = '管理 SiFli SDK 安装';
    }

    if (this.currentSdkVersionStatusItem) {
      const sdkVersionText = currentSdk ? currentSdk.version : 'N/A';
      this.currentSdkVersionStatusItem.text = `SDK: ${sdkVersionText}`;
      this.currentSdkVersionStatusItem.tooltip = `当前 SiFli SDK 版本: ${sdkVersionText}\\n点击切换 SDK 版本`;
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
    this.currentSdkVersionStatusItem?.dispose();
    this.currentBoardStatusItem?.dispose();
    this.currentSerialPortStatusItem?.dispose();
    this.sdkManageBtn?.dispose();
  }
}
