import * as vscode from 'vscode';
import { PeripheralTreeProvider } from '../views/peripheral-tree-provider';
import { COMMAND_ANALYSIS_RUN_ALL, COMMAND_ANALYSIS_RUN_GROUP, DEBUG_TYPE } from '../manifest';
import { registerBuiltInPeripheralAnalyzers } from './rules';
import { PeripheralAnalysisRuntime } from './runtime';
import { PeripheralAnalysisViewProvider } from './view-provider';

export class PeripheralAnalysisManager implements vscode.Disposable {
  private readonly runtime: PeripheralAnalysisRuntime;
  private readonly viewProvider: PeripheralAnalysisViewProvider;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly treeProvider: PeripheralTreeProvider) {
    this.runtime = new PeripheralAnalysisRuntime(treeProvider);
    registerBuiltInPeripheralAnalyzers(this.runtime);
    this.viewProvider = new PeripheralAnalysisViewProvider(this.runtime);
  }

  public activate(context: vscode.ExtensionContext): vscode.Disposable {
    const viewDisposable = this.viewProvider.activate();
    this.disposables.push(
      viewDisposable,
      vscode.commands.registerCommand(COMMAND_ANALYSIS_RUN_ALL, async () => {
        if (!this.ensureAnalyzableSession()) {
          return;
        }
        await this.runtime.runAll();
        this.viewProvider.refresh();
      }),
      vscode.commands.registerCommand(
        COMMAND_ANALYSIS_RUN_GROUP,
        async (node?: { result?: { groupName?: string } }) => {
          if (!this.ensureAnalyzableSession()) {
            return;
          }
          const groupName = node?.result?.groupName;
          if (!groupName) {
            return;
          }
          await this.runtime.runGroup(groupName);
          this.viewProvider.refresh();
        }
      ),
      vscode.debug.onDidChangeActiveDebugSession(() => {
        this.viewProvider.refresh();
      }),
      this.treeProvider.onDidChangeTreeData(() => {
        this.viewProvider.refresh();
      }),
      vscode.debug.onDidTerminateDebugSession(session => {
        if (session.type === DEBUG_TYPE) {
          this.runtime.clearSession(session.id);
          this.viewProvider.refresh();
        }
      })
    );

    const disposable = new vscode.Disposable(() => {
      for (const item of this.disposables.splice(0)) {
        item.dispose();
      }
    });
    context.subscriptions.push(disposable);
    return disposable;
  }

  public dispose(): void {
    for (const item of this.disposables.splice(0)) {
      item.dispose();
    }
  }

  public getRuntime(): PeripheralAnalysisRuntime {
    return this.runtime;
  }

  private ensureAnalyzableSession(): boolean {
    const activeSession = vscode.debug.activeDebugSession;
    if (!activeSession || activeSession.type !== DEBUG_TYPE) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t('Peripheral analysis is available only during an active sifli-probe-rs debug session.')
      );
      return false;
    }
    if (!this.treeProvider.isActiveSessionStopped()) {
      void vscode.window.showWarningMessage(vscode.l10n.t('Pause the target before running peripheral analysis.'));
      return false;
    }
    return true;
  }
}
