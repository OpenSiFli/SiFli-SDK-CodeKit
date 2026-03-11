import * as vscode from 'vscode';
import { CMD_PREFIX } from '../constants';
import { WorkflowStatusBarButton } from '../types';
import { ConfigService } from '../services/configService';
import { SerialPortService } from '../services/serialPortService';
import { SerialMonitorService } from '../services/serialMonitorService';
import { WorkflowService } from '../services/workflowService';
import { SifliSidebarManager } from './sifliSidebarProvider';

export class StatusBarProvider {
  private static instance: StatusBarProvider;
  private configService: ConfigService;
  private serialPortService: SerialPortService;
  private serialMonitorService: SerialMonitorService;
  private workflowService: WorkflowService;

  private context?: vscode.ExtensionContext;

  private currentBoardStatusItem?: vscode.StatusBarItem;
  private sdkManageBtn?: vscode.StatusBarItem;
  private currentSerialPortStatusItem?: vscode.StatusBarItem;
  private currentSdkVersionStatusItem?: vscode.StatusBarItem;
  private actionButtons = new Map<string, vscode.StatusBarItem>();
  private resolvedActionButtons = new Map<string, WorkflowStatusBarButton>();

  private readonly defaultWorkflowButtons: WorkflowStatusBarButton[] = [
    {
      id: 'compile',
      text: '$(symbol-property)',
      tooltip: 'Run SiFli build',
      priority: 98,
      action: { kind: 'command', commandId: CMD_PREFIX + 'compile' },
    },
    {
      id: 'rebuild',
      text: '$(sync)',
      tooltip: 'Clean and run SiFli build',
      priority: 97,
      action: { kind: 'command', commandId: CMD_PREFIX + 'rebuild' },
    },
    {
      id: 'clean',
      text: '$(trashcan)',
      tooltip: 'Delete SiFli build cache',
      priority: 96,
      action: { kind: 'command', commandId: CMD_PREFIX + 'clean' },
    },
    {
      id: 'download',
      text: '$(symbol-event)',
      tooltip: 'Run SiFli download',
      priority: 95,
      action: { kind: 'command', commandId: CMD_PREFIX + 'download' },
    },
    {
      id: 'menuconfig',
      text: '$(settings-gear)',
      tooltip: 'Open SiFli Menuconfig',
      priority: 94,
      action: { kind: 'command', commandId: CMD_PREFIX + 'menuconfig' },
    },
    {
      id: 'deviceMonitor',
      text: '$(device-desktop)',
      tooltip: 'Monitor device - open serial monitor',
      priority: 93,
      action: { kind: 'command', commandId: CMD_PREFIX + 'openDeviceMonitor' },
    },
  ];

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.serialPortService = SerialPortService.getInstance();
    this.serialMonitorService = SerialMonitorService.getInstance();
    this.workflowService = WorkflowService.getInstance();
  }

  public static getInstance(): StatusBarProvider {
    if (!StatusBarProvider.instance) {
      StatusBarProvider.instance = new StatusBarProvider();
    }
    return StatusBarProvider.instance;
  }

  public initializeStatusBarItems(context: vscode.ExtensionContext): void {
    this.context = context;

    this.sdkManageBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102);
    this.sdkManageBtn.text = '$(cloud-download)';
    this.sdkManageBtn.tooltip = vscode.l10n.t('Manage SiFli SDK installation');
    this.sdkManageBtn.command = CMD_PREFIX + 'manageSiFliSdk';
    this.sdkManageBtn.show();
    context.subscriptions.push(this.sdkManageBtn);

    this.currentSdkVersionStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
    this.currentSdkVersionStatusItem.text = vscode.l10n.t('SDK: {0}', vscode.l10n.t('N/A'));
    this.currentSdkVersionStatusItem.tooltip = vscode.l10n.t('Click to switch SiFli SDK version');
    this.currentSdkVersionStatusItem.command = CMD_PREFIX + 'switchSdkVersion';
    this.currentSdkVersionStatusItem.show();
    context.subscriptions.push(this.currentSdkVersionStatusItem);

    this.currentBoardStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.currentBoardStatusItem.text = vscode.l10n.t('$(circuit-board) SiFli Board: {0}', vscode.l10n.t('N/A'));
    this.currentBoardStatusItem.command = CMD_PREFIX + 'selectChipModule';
    this.currentBoardStatusItem.show();
    context.subscriptions.push(this.currentBoardStatusItem);

    this.currentSerialPortStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.currentSerialPortStatusItem.text = vscode.l10n.t('$(plug) COM: {0}', vscode.l10n.t('N/A'));
    this.currentSerialPortStatusItem.command = CMD_PREFIX + 'selectPort';
    this.currentSerialPortStatusItem.show();
    context.subscriptions.push(this.currentSerialPortStatusItem);

    this.renderActionButtons();
    this.updateStatusBarItems();
  }

  public async executeStatusBarButton(buttonId: string): Promise<void> {
    const button = this.resolvedActionButtons.get(buttonId);
    if (!button) {
      vscode.window.showErrorMessage(vscode.l10n.t('Status bar button not found: {0}', buttonId));
      return;
    }
    await this.workflowService.executeButtonAction(button);
  }

  public getDefaultWorkflowButtons(): WorkflowStatusBarButton[] {
    return this.defaultWorkflowButtons.map(button => ({
      ...button,
      action: { ...button.action },
    }));
  }

  public updateStatusBarItems(): void {
    const selectedBoardName = this.configService.getSelectedBoardName();
    const numThreads = this.configService.getNumThreads();
    const selectedSerialPort = this.serialPortService.selectedSerialPort;
    const currentSdk = this.configService.getCurrentSdk();
    const notAvailable = vscode.l10n.t('N/A');
    const notSelected = vscode.l10n.t('Not selected');

    this.renderActionButtons();

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

    if (this.currentSdkVersionStatusItem) {
      const sdkVersionText = currentSdk ? currentSdk.version : notAvailable;
      this.currentSdkVersionStatusItem.text = vscode.l10n.t('SDK: {0}', sdkVersionText);
      this.currentSdkVersionStatusItem.tooltip = vscode.l10n.t(
        'Current SiFli SDK version: {0}\nClick to switch SDK version',
        sdkVersionText
      );
    }

    if (this.sdkManageBtn) {
      this.sdkManageBtn.tooltip = vscode.l10n.t('Manage SiFli SDK installation');
    }

    try {
      const sidebarManager = SifliSidebarManager.getInstance();
      sidebarManager.refresh();
    } catch {
      // ignore
    }
  }

  public async openDeviceMonitor(): Promise<void> {
    try {
      await this.serialMonitorService.initialize();
      const selectedSerialPort = this.serialPortService.selectedSerialPort;
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
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to open device monitor: {0}', String(error)));
    }
  }

  public async closeDeviceMonitor(): Promise<void> {
    try {
      const success = await this.serialMonitorService.closeSerialMonitor();
      if (success) {
        vscode.window.showInformationMessage(vscode.l10n.t('Device monitor closed.'));
      } else {
        vscode.window.showWarningMessage(vscode.l10n.t('Failed to close device monitor.'));
      }
    } catch (error) {
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to close device monitor: {0}', String(error)));
    }
  }

  public async handlePreDownloadOperation(): Promise<boolean> {
    try {
      if (this.serialMonitorService.hasActiveMonitor()) {
        return await this.serialMonitorService.closeSerialMonitor();
      }
      return true;
    } catch {
      return false;
    }
  }

  public async handlePostDownloadOperation(): Promise<void> {
    try {
      if (this.serialMonitorService.canResume()) {
        const resumed = await this.serialMonitorService.resumeSerialMonitor();
        if (resumed) {
          vscode.window.showInformationMessage(vscode.l10n.t('Download completed. Serial monitor reopened.'));
        } else {
          vscode.window.showWarningMessage(
            vscode.l10n.t(
              'Download completed, but failed to auto-restore the serial monitor. You can reopen it from the monitor button.'
            )
          );
        }
      }
    } catch {
      vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Download completed, but an error occurred while restoring the serial monitor. You can reopen it from the monitor button.'
        )
      );
    }
  }

  public dispose(): void {
    this.actionButtons.forEach(item => item.dispose());
    this.actionButtons.clear();
    this.resolvedActionButtons.clear();
    this.currentSdkVersionStatusItem?.dispose();
    this.currentBoardStatusItem?.dispose();
    this.currentSerialPortStatusItem?.dispose();
    this.sdkManageBtn?.dispose();
  }

  private renderActionButtons(): void {
    this.actionButtons.forEach(item => item.dispose());
    this.actionButtons.clear();
    this.resolvedActionButtons.clear();

    const configured = this.workflowService.getResolvedStatusBarButtons();
    const merged = new Map<string, WorkflowStatusBarButton>();
    this.defaultWorkflowButtons.forEach(button => {
      merged.set(button.id, { ...button });
    });
    configured.forEach(button => {
      merged.set(button.id, { ...button, action: { ...button.action } });
    });

    merged.forEach(button => {
      const alignment = button.alignment === 'right' ? vscode.StatusBarAlignment.Right : vscode.StatusBarAlignment.Left;
      const item = vscode.window.createStatusBarItem(alignment, button.priority ?? 90);
      item.text = this.ensureStatusBarTextHasIcon(button.text);
      item.tooltip = button.tooltip;
      item.command = {
        command: CMD_PREFIX + 'runStatusBarButton',
        title: button.tooltip || button.text,
        arguments: [button.id],
      };
      item.show();

      this.actionButtons.set(button.id, item);
      this.resolvedActionButtons.set(button.id, button);
    });
  }

  private ensureStatusBarTextHasIcon(text: string): string {
    const raw = text || '';
    const hasIconPrefix = /^\s*\$\([^)]+\)/.test(raw);
    if (hasIconPrefix) {
      return raw;
    }
    const trimmed = raw.trim();
    return trimmed ? `$(rocket) ${trimmed}` : '$(rocket)';
  }
}
