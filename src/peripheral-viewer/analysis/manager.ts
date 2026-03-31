import * as vscode from 'vscode';
import { PeripheralTreeProvider } from '../views/peripheral-tree-provider';
import {
  ANALYSIS_UI_STATE_KEY,
  COMMAND_ANALYSIS_OPEN_DASHBOARD,
  COMMAND_ANALYSIS_RESET_FILTERS,
  COMMAND_ANALYSIS_RUN_ALL,
  COMMAND_ANALYSIS_RUN_GROUP,
  COMMAND_ANALYSIS_SET_FILTERS,
  COMMAND_ANALYSIS_SWITCH_VIEW,
  DEBUG_TYPE,
} from '../manifest';
import { PeripheralAnalysisDashboardProvider } from './dashboard-provider';
import { PeripheralAnalysisUiState } from './ui-state';
import { registerBuiltInPeripheralAnalyzers } from './rules';
import { PeripheralAnalysisRuntime } from './runtime';
import {
  AnalysisFilterState,
  AnalysisSessionState,
  AnalysisSeverity,
  AnalysisStatusFilter,
  AnalysisViewMode,
} from './types';
import { PeripheralAnalysisViewProvider } from './view-provider';

interface GroupQuickPickItem extends vscode.QuickPickItem {
  groupName?: string;
  resetsToAll?: boolean;
}

interface ChoiceQuickPickItem<T> extends vscode.QuickPickItem {
  value: T;
}

export class PeripheralAnalysisManager implements vscode.Disposable {
  private readonly runtime: PeripheralAnalysisRuntime;
  private readonly disposables: vscode.Disposable[] = [];
  private uiState?: PeripheralAnalysisUiState;
  private viewProvider?: PeripheralAnalysisViewProvider;
  private dashboardProvider?: PeripheralAnalysisDashboardProvider;

  constructor(private readonly treeProvider: PeripheralTreeProvider) {
    this.runtime = new PeripheralAnalysisRuntime(treeProvider);
    registerBuiltInPeripheralAnalyzers(this.runtime);
  }

  public activate(context: vscode.ExtensionContext): vscode.Disposable {
    this.uiState ??= new PeripheralAnalysisUiState(context.workspaceState, ANALYSIS_UI_STATE_KEY);
    this.viewProvider ??= new PeripheralAnalysisViewProvider(this.runtime, this.uiState);
    this.dashboardProvider ??= new PeripheralAnalysisDashboardProvider(context, this.runtime, this.uiState);

    const viewDisposable = this.viewProvider.activate();
    this.disposables.push(
      viewDisposable,
      this.uiState,
      this.dashboardProvider,
      vscode.commands.registerCommand(COMMAND_ANALYSIS_RUN_ALL, async () => {
        if (!this.ensureAnalyzableSession()) {
          return;
        }
        await this.runtime.runAll();
        this.refreshViews();
      }),
      vscode.commands.registerCommand(COMMAND_ANALYSIS_RUN_GROUP, async (node?: { group?: { groupName?: string } }) => {
        if (!this.ensureAnalyzableSession()) {
          return;
        }
        const groupName = node?.group?.groupName;
        if (!groupName) {
          return;
        }
        await this.runtime.runGroup(groupName);
        this.refreshViews();
      }),
      vscode.commands.registerCommand(COMMAND_ANALYSIS_OPEN_DASHBOARD, () => {
        this.dashboardProvider?.show();
      }),
      vscode.commands.registerCommand(COMMAND_ANALYSIS_SET_FILTERS, async () => {
        await this.promptForFilters();
      }),
      vscode.commands.registerCommand(COMMAND_ANALYSIS_SWITCH_VIEW, async () => {
        await this.promptForViewMode();
      }),
      vscode.commands.registerCommand(COMMAND_ANALYSIS_RESET_FILTERS, async () => {
        await this.uiState?.resetFilters();
      }),
      vscode.debug.onDidChangeActiveDebugSession(() => {
        this.refreshViews();
      }),
      this.treeProvider.onDidChangeTreeData(() => {
        this.refreshViews();
      }),
      vscode.debug.onDidTerminateDebugSession(session => {
        if (session.type === DEBUG_TYPE) {
          this.runtime.clearSession(session.id);
          this.refreshViews();
        }
      }),
      this.uiState.onDidChange(() => {
        this.refreshViews();
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

  private refreshViews(): void {
    this.viewProvider?.refresh();
    this.dashboardProvider?.refresh();
  }

  private async promptForFilters(): Promise<void> {
    const sessionState = this.runtime.getActiveSessionState();
    if (!sessionState || sessionState.groups.length === 0) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t('Run peripheral analysis during an active debug session before setting filters.')
      );
      return;
    }

    if (sessionState.message) {
      void vscode.window.showWarningMessage(sessionState.message);
      return;
    }

    const uiState = this.uiState;
    if (!uiState) {
      return;
    }

    const currentFilters = uiState.getFilters(sessionState);
    const severityItems: ChoiceQuickPickItem<AnalysisFilterState['severity']>[] = [
      {
        label: vscode.l10n.t('All severities'),
        description: currentFilters.severity === 'all' ? vscode.l10n.t('Current') : undefined,
        value: 'all',
      },
      {
        label: vscode.l10n.t('Errors only'),
        description: currentFilters.severity === AnalysisSeverity.Error ? vscode.l10n.t('Current') : undefined,
        value: AnalysisSeverity.Error,
      },
      {
        label: vscode.l10n.t('Warnings only'),
        description: currentFilters.severity === AnalysisSeverity.Warning ? vscode.l10n.t('Current') : undefined,
        value: AnalysisSeverity.Warning,
      },
    ];
    const statusItems: ChoiceQuickPickItem<AnalysisStatusFilter>[] = [
      {
        label: vscode.l10n.t('All statuses'),
        description: currentFilters.status === 'all' ? vscode.l10n.t('Current') : undefined,
        value: 'all',
      },
      {
        label: vscode.l10n.t('Issues only'),
        description: currentFilters.status === 'issues' ? vscode.l10n.t('Current') : undefined,
        value: 'issues',
      },
      {
        label: vscode.l10n.t('Clean only'),
        description: currentFilters.status === 'clean' ? vscode.l10n.t('Current') : undefined,
        value: 'clean',
      },
    ];

    const severityChoice = await vscode.window.showQuickPick(severityItems, {
      title: vscode.l10n.t('Peripheral Analysis Severity Filter'),
      placeHolder: vscode.l10n.t('Choose which finding severities to show.'),
    });
    if (!severityChoice) {
      return;
    }

    const statusChoice = await vscode.window.showQuickPick(statusItems, {
      title: vscode.l10n.t('Peripheral Analysis Status Filter'),
      placeHolder: vscode.l10n.t('Choose which peripheral states to show.'),
    });
    if (!statusChoice) {
      return;
    }

    const groupItems: GroupQuickPickItem[] = [
      {
        label: vscode.l10n.t('All groups'),
        description: currentFilters.groups.length === 0 ? vscode.l10n.t('Current') : undefined,
        resetsToAll: true,
        picked: currentFilters.groups.length === 0,
      },
      ...sessionState.groups.map(group => ({
        label: group.groupName,
        groupName: group.groupName,
        picked: currentFilters.groups.length === 0 || currentFilters.groups.includes(group.groupName),
      })),
    ];

    const selectedGroups = await vscode.window.showQuickPick(groupItems, {
      canPickMany: true,
      title: vscode.l10n.t('Peripheral Analysis Group Filter'),
      placeHolder: vscode.l10n.t('Select groups to keep visible.'),
    });
    if (!selectedGroups) {
      return;
    }

    const nextGroups =
      selectedGroups.length === 0 || selectedGroups.some(item => item.resetsToAll)
        ? []
        : selectedGroups
            .map(item => item.groupName)
            .filter((groupName): groupName is string => typeof groupName === 'string')
            .sort((left, right) => left.localeCompare(right));

    await uiState.setFilters(
      {
        severity: severityChoice.value,
        status: statusChoice.value,
        groups: nextGroups,
      },
      sessionState
    );
  }

  private async promptForViewMode(): Promise<void> {
    const uiState = this.uiState;
    if (!uiState) {
      return;
    }

    const currentViewMode = uiState.getViewMode();
    const items: ChoiceQuickPickItem<AnalysisViewMode>[] = [
      {
        label: vscode.l10n.t('By Peripheral'),
        description: currentViewMode === 'peripheral' ? vscode.l10n.t('Current') : undefined,
        value: 'peripheral',
      },
      {
        label: vscode.l10n.t('By Result Type'),
        description: currentViewMode === 'severity' ? vscode.l10n.t('Current') : undefined,
        value: 'severity',
      },
    ];

    const choice = await vscode.window.showQuickPick(items, {
      title: vscode.l10n.t('Peripheral Analysis View Mode'),
      placeHolder: vscode.l10n.t('Choose how analysis results are grouped.'),
    });
    if (!choice) {
      return;
    }

    await uiState.setViewMode(choice.value);
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
