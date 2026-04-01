import * as vscode from 'vscode';
import { NumberFormat } from './common';
import {
  COMMAND_COPY_VALUE,
  COMMAND_FORCE_REFRESH,
  COMMAND_REFRESH_ALL,
  COMMAND_SET_FORMAT,
  COMMAND_TOGGLE_PIN,
  COMMAND_UPDATE_NODE,
} from './manifest';
import { PeripheralTreeProvider } from './views/peripheral-tree-provider';
import { PeripheralBaseNode } from './views/nodes/basenode';

export class Commands {
  constructor(private readonly peripheralProvider: PeripheralTreeProvider) {}

  public activate(context: vscode.ExtensionContext): vscode.Disposable {
    const disposables = [
      vscode.commands.registerCommand(COMMAND_UPDATE_NODE, (node?: PeripheralBaseNode) =>
        this.peripheralsUpdateNode(node)
      ),
      vscode.commands.registerCommand(COMMAND_COPY_VALUE, (node?: PeripheralBaseNode) =>
        this.peripheralsCopyValue(node)
      ),
      vscode.commands.registerCommand(COMMAND_SET_FORMAT, (node?: PeripheralBaseNode) =>
        this.peripheralsSetFormat(node)
      ),
      vscode.commands.registerCommand(COMMAND_FORCE_REFRESH, (node?: PeripheralBaseNode) =>
        this.peripheralsForceRefresh(node)
      ),
      vscode.commands.registerCommand(COMMAND_TOGGLE_PIN, (node?: PeripheralBaseNode) =>
        this.peripheralsTogglePin(node)
      ),
      vscode.commands.registerCommand(COMMAND_REFRESH_ALL, () => this.peripheralsForceRefresh()),
    ];

    const disposable = new vscode.Disposable(() => {
      for (const item of disposables) {
        item.dispose();
      }
    });
    context.subscriptions.push(disposable);
    return disposable;
  }

  private async peripheralsUpdateNode(node?: PeripheralBaseNode): Promise<void> {
    if (!node) {
      return;
    }

    try {
      const updated = await node.performUpdate();
      if (updated) {
        await this.peripheralsForceRefresh(node);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(vscode.l10n.t('Unable to update peripheral value: {0}', message));
    }
  }

  private peripheralsCopyValue(node?: PeripheralBaseNode): void {
    const value = node?.getCopyValue();
    if (value) {
      void vscode.env.clipboard.writeText(value);
    }
  }

  private async peripheralsSetFormat(node?: PeripheralBaseNode): Promise<void> {
    if (!node) {
      return;
    }

    const result = await vscode.window.showQuickPick(
      [
        {
          label: vscode.l10n.t('Auto'),
          description: vscode.l10n.t('Automatically choose a format and inherit from parent when possible.'),
          value: NumberFormat.Auto,
        },
        {
          label: vscode.l10n.t('Hex'),
          description: vscode.l10n.t('Display values in hexadecimal.'),
          value: NumberFormat.Hexadecimal,
        },
        {
          label: vscode.l10n.t('Decimal'),
          description: vscode.l10n.t('Display values in decimal.'),
          value: NumberFormat.Decimal,
        },
        {
          label: vscode.l10n.t('Binary'),
          description: vscode.l10n.t('Display values in binary.'),
          value: NumberFormat.Binary,
        },
      ],
      {
        title: vscode.l10n.t('Peripheral Viewer Format'),
      }
    );

    if (!result) {
      return;
    }

    await this.peripheralProvider.setNodeFormat(node, result.value);
  }

  private async peripheralsForceRefresh(node?: PeripheralBaseNode): Promise<void> {
    await this.peripheralProvider.forceRefreshNode(node);
  }

  private async peripheralsTogglePin(node?: PeripheralBaseNode): Promise<void> {
    if (!node) {
      return;
    }

    await this.peripheralProvider.togglePinPeripheral(node);
  }
}
