import * as vscode from 'vscode';
import { SvdAnalyzerRegistry, ISvdAnalyzer } from './analysis/analyzer';
import { PeripheralAnalysisManager } from './analysis/manager';
import { Commands } from './commands';
import { DebugSnapshotBackend } from './export/debugSnapshotBackend';
import { onProbeRsDidSendMessage } from '../probe-rs/extension';
import { CONFLICT_EXTENSION_ID, CONTEXT_ENABLED, DEBUG_TYPE } from './manifest';
import { clearParsedSvdCache } from './peripherals-provider';
import { PeripheralViewerSessionData } from './session-data';
import { PeripheralTreeProvider } from './views/peripheral-tree-provider';

class PeripheralViewerManager implements vscode.Disposable {
  private readonly analyzerRegistry = new SvdAnalyzerRegistry();
  private readonly disposables: vscode.Disposable[] = [];
  private treeProvider?: PeripheralTreeProvider;
  private analysisManager?: PeripheralAnalysisManager;
  private commands?: Commands;

  public async activate(context: vscode.ExtensionContext): Promise<void> {
    await vscode.commands.executeCommand('setContext', CONTEXT_ENABLED, false);

    const conflictExtension = vscode.extensions.getExtension(CONFLICT_EXTENSION_ID);
    if (conflictExtension) {
      const disableAndReload = vscode.l10n.t('Disable and Reload');
      void vscode.window
        .showWarningMessage(
          vscode.l10n.t(
            'Detected "Peripheral Viewer" extension (mcu-debug.peripheral-viewer) which conflicts with the built-in peripheral viewer. Please disable it and reload the window.'
          ),
          disableAndReload
        )
        .then(async choice => {
          if (choice !== disableAndReload) {
            return;
          }

          try {
            await vscode.commands.executeCommand('workbench.extensions.disableExtension', CONFLICT_EXTENSION_ID);
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            void vscode.window.showWarningMessage(
              vscode.l10n.t('Failed to disable the conflicting Peripheral Viewer extension automatically: {0}', message)
            );
          }
        });
      return;
    }

    this.treeProvider = new PeripheralTreeProvider(context);
    this.analysisManager = new PeripheralAnalysisManager(this.treeProvider);
    this.commands = new Commands(this.treeProvider);

    this.disposables.push(
      this.treeProvider.activate(),
      this.analysisManager.activate(context),
      this.commands.activate(context),
      vscode.debug.onDidStartDebugSession(session => {
        if (session.type === DEBUG_TYPE) {
          void this.treeProvider?.onDebugSessionStarted(session);
        }
      }),
      vscode.debug.onDidTerminateDebugSession(session => {
        if (session.type === DEBUG_TYPE) {
          void this.treeProvider?.onDebugSessionTerminated(session);
        }
      }),
      vscode.debug.onDidChangeActiveDebugSession(session => {
        this.treeProvider?.onActiveSessionChanged(session);
      }),
      onProbeRsDidSendMessage((session, message) => {
        this.treeProvider?.onDebugAdapterMessage(session, message);
      })
    );

    if (vscode.debug.activeDebugSession?.type === DEBUG_TYPE) {
      await this.treeProvider.onDebugSessionStarted(vscode.debug.activeDebugSession);
    }

    this.treeProvider.onActiveSessionChanged(vscode.debug.activeDebugSession);
    await vscode.commands.executeCommand('setContext', CONTEXT_ENABLED, true);
  }

  public registerAnalyzer(analyzer: ISvdAnalyzer): void {
    this.analyzerRegistry.register(analyzer);
  }

  public unregisterAnalyzer(name: string): void {
    this.analyzerRegistry.unregister(name);
  }

  public getAnalyzerRegistry(): SvdAnalyzerRegistry {
    return this.analyzerRegistry;
  }

  public getTreeProvider(): PeripheralTreeProvider | undefined {
    return this.treeProvider;
  }

  public getActiveSessionData(): PeripheralViewerSessionData | undefined {
    return this.treeProvider?.getActiveSessionData();
  }

  public getDebugSnapshotBackend(): DebugSnapshotBackend | undefined {
    return this.commands?.getDebugSnapshotBackend();
  }

  public async runDebugSnapshotExport(): Promise<boolean> {
    if (!this.commands) {
      return false;
    }

    await this.commands.runDebugSnapshotExport();
    return true;
  }

  public dispose(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    clearParsedSvdCache();
    this.analysisManager = undefined;
    this.treeProvider = undefined;
    this.commands = undefined;
  }
}

let peripheralViewerManager: PeripheralViewerManager | undefined;

export async function initPeripheralViewer(context: vscode.ExtensionContext): Promise<vscode.Disposable> {
  if (!peripheralViewerManager) {
    peripheralViewerManager = new PeripheralViewerManager();
  }

  await peripheralViewerManager.activate(context);
  return peripheralViewerManager;
}

export function getPeripheralViewerAnalyzerRegistry(): SvdAnalyzerRegistry {
  if (!peripheralViewerManager) {
    peripheralViewerManager = new PeripheralViewerManager();
  }

  return peripheralViewerManager.getAnalyzerRegistry();
}

export function getActivePeripheralViewerSessionData(): PeripheralViewerSessionData | undefined {
  return peripheralViewerManager?.getActiveSessionData();
}

export function registerPeripheralViewerAnalyzer(analyzer: ISvdAnalyzer): void {
  if (!peripheralViewerManager) {
    peripheralViewerManager = new PeripheralViewerManager();
  }

  peripheralViewerManager.registerAnalyzer(analyzer);
}

export function unregisterPeripheralViewerAnalyzer(name: string): void {
  peripheralViewerManager?.unregisterAnalyzer(name);
}

export function disposePeripheralViewer(): void {
  peripheralViewerManager?.dispose();
  peripheralViewerManager = undefined;
}

export function getPeripheralViewerDebugSnapshotBackend(): DebugSnapshotBackend | undefined {
  return peripheralViewerManager?.getDebugSnapshotBackend();
}

export async function runPeripheralViewerDebugSnapshotExport(): Promise<boolean> {
  if (!peripheralViewerManager) {
    return false;
  }

  return peripheralViewerManager.runDebugSnapshotExport();
}

export * from './types';
export * from './analysis/analyzer';
export * from './analysis/types';
