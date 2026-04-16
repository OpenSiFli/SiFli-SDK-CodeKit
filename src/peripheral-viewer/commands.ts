import * as vscode from 'vscode';
import { NumberFormat } from './common';
import { DebugSnapshotChipOption, DebugSnapshotCandidateItem } from '../types/debugSnapshot';
import { DebugSnapshotBackend } from './export/debugSnapshotBackend';
import {
  COMMAND_DEBUG_SNAPSHOT_EXPORT,
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
  private debugSnapshotBackend?: DebugSnapshotBackend;

  constructor(private readonly peripheralProvider: PeripheralTreeProvider) {}

  public activate(context: vscode.ExtensionContext): vscode.Disposable {
    this.debugSnapshotBackend ??= new DebugSnapshotBackend(context, this.peripheralProvider);

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
      vscode.commands.registerCommand(COMMAND_DEBUG_SNAPSHOT_EXPORT, () => this.exportDebugSnapshot()),
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

  private async exportDebugSnapshot(): Promise<void> {
    const backend = this.debugSnapshotBackend;
    if (!backend) {
      return;
    }

    try {
      const bootstrap = await backend.getDebugSnapshotBootstrap();
      if (!bootstrap.session.canExport) {
        void vscode.window.showErrorMessage(
          bootstrap.warnings[0] ?? vscode.l10n.t('Debug snapshot export is unavailable.')
        );
        return;
      }

      const chip = await this.pickPartNumber(bootstrap.chipOptions);
      if (!chip) {
        return;
      }

      const plan = await backend.buildDebugSnapshotPlan(chip.partNumber);
      if (plan.warnings.length > 0) {
        void vscode.window.showWarningMessage(plan.warnings.join(' '));
      }

      const selectedItems = await this.pickSnapshotItems(plan.items);
      if (!selectedItems) {
        return;
      }
      if (selectedItems.length === 0) {
        void vscode.window.showWarningMessage(vscode.l10n.t('Select at least one debug snapshot item to export.'));
        return;
      }

      const outputSelection = await backend.browseDebugSnapshotOutputRoot();
      if (outputSelection.cancelled || !outputSelection.outputRoot) {
        return;
      }
      const outputRoot = outputSelection.outputRoot;

      const finalTask = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: vscode.l10n.t('Exporting debug snapshot for {0}', chip.partNumber),
          cancellable: true,
        },
        async (progress, token) => {
          const task = await backend.startDebugSnapshotExport({
            partNumber: chip.partNumber,
            outputRoot,
            selectedItemIds: selectedItems.map(item => item.id),
          });

          const disposable = backend.onDidEmitEvent(event => {
            if (event.command === 'debugSnapshotTaskUpdated' && event.task.taskId === task.taskId) {
              const lastLog = event.task.logs[event.task.logs.length - 1];
              if (lastLog) {
                progress.report({
                  message: lastLog.message,
                });
              }
            }
          });

          token.onCancellationRequested(() => {
            void backend.cancelDebugSnapshotTask(task.taskId);
          });

          try {
            return await backend.waitForTaskCompletion(task.taskId);
          } finally {
            disposable.dispose();
          }
        }
      );

      if (!finalTask) {
        return;
      }

      if (finalTask.status === 'succeeded' && finalTask.outputDir) {
        void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(finalTask.outputDir));
        void vscode.window.showInformationMessage(
          vscode.l10n.t('Debug snapshot export completed: {0}', finalTask.outputDir)
        );
        return;
      }

      if (finalTask.status === 'cancelled') {
        void vscode.window.showWarningMessage(vscode.l10n.t('Debug snapshot export was cancelled.'));
        return;
      }

      void vscode.window.showErrorMessage(
        vscode.l10n.t('Debug snapshot export failed: {0}', finalTask.error ?? vscode.l10n.t('Unknown error'))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(vscode.l10n.t('Debug snapshot export failed: {0}', message));
    }
  }

  private async pickPartNumber(chipOptions: DebugSnapshotChipOption[]): Promise<DebugSnapshotChipOption | undefined> {
    return vscode.window
      .showQuickPick(
        chipOptions.map(option => ({
          label: option.partNumber,
          description: option.modelId,
          detail: option.description ? `${option.description} | ${option.psramSummary}` : option.psramSummary,
          option,
        })),
        {
          title: vscode.l10n.t('Debug Snapshot Part Number'),
          matchOnDescription: true,
          matchOnDetail: true,
          placeHolder: vscode.l10n.t('Select the exact part number for this snapshot.'),
        }
      )
      .then(result => result?.option);
  }

  private async pickSnapshotItems(
    items: DebugSnapshotCandidateItem[]
  ): Promise<DebugSnapshotCandidateItem[] | undefined> {
    const picks = await vscode.window.showQuickPick(
      items.map(item => ({
        label: item.fileName,
        description: `${item.kind} @ 0x${item.address.toString(16)}`,
        detail: `${this.formatSize(item.size)} | ${item.source}${item.peripheralName ? ` | ${item.peripheralName}` : ''}`,
        picked: item.selectedByDefault,
        item,
      })),
      {
        canPickMany: true,
        title: vscode.l10n.t('Debug Snapshot Items'),
        placeHolder: vscode.l10n.t('Select the memory regions and register blocks to export.'),
      }
    );

    return picks?.map(pick => pick.item);
  }

  private formatSize(size: number): string {
    if (size >= 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(size % (1024 * 1024) === 0 ? 0 : 2)}MB`;
    }
    if (size >= 1024) {
      return `${(size / 1024).toFixed(size % 1024 === 0 ? 0 : 2)}KB`;
    }
    return `${size}B`;
  }
}
