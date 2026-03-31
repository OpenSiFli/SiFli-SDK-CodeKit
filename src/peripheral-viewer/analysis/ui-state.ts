import * as vscode from 'vscode';
import {
  AnalysisFilterState,
  AnalysisSessionState,
  AnalysisStatusFilter,
  AnalysisViewMode,
  AnalysisSeverity,
  AnalysisSeverityFilter,
} from './types';

interface StoredAnalysisUiState {
  viewMode?: AnalysisViewMode;
  filters?: Partial<AnalysisFilterState>;
}

function isViewMode(value: unknown): value is AnalysisViewMode {
  return value === 'peripheral' || value === 'severity';
}

function isSeverityFilter(value: unknown): value is AnalysisSeverityFilter {
  return value === 'all' || value === AnalysisSeverity.Error || value === AnalysisSeverity.Warning;
}

function isStatusFilter(value: unknown): value is AnalysisStatusFilter {
  return value === 'all' || value === 'issues' || value === 'clean';
}

export class PeripheralAnalysisUiState implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  private viewMode: AnalysisViewMode = 'peripheral';
  private filters: AnalysisFilterState = {
    severity: 'all',
    status: 'all',
    groups: [],
  };

  public readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(
    private readonly storage: vscode.Memento,
    private readonly storageKey: string
  ) {
    const stored = storage.get<StoredAnalysisUiState>(storageKey);
    if (stored?.viewMode && isViewMode(stored.viewMode)) {
      this.viewMode = stored.viewMode;
    }

    const storedFilters = stored?.filters;
    if (storedFilters) {
      this.filters = {
        severity: isSeverityFilter(storedFilters.severity) ? storedFilters.severity : 'all',
        status: isStatusFilter(storedFilters.status) ? storedFilters.status : 'all',
        groups: Array.isArray(storedFilters.groups)
          ? storedFilters.groups.filter((group): group is string => typeof group === 'string')
          : [],
      };
    }
  }

  public dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  public getViewMode(): AnalysisViewMode {
    return this.viewMode;
  }

  public getFilters(sessionState?: AnalysisSessionState): AnalysisFilterState {
    return this.normalizeFilters(this.filters, sessionState);
  }

  public async setViewMode(viewMode: AnalysisViewMode): Promise<void> {
    if (this.viewMode === viewMode) {
      return;
    }

    this.viewMode = viewMode;
    await this.persist();
    this.onDidChangeEmitter.fire();
  }

  public async toggleViewMode(): Promise<void> {
    await this.setViewMode(this.viewMode === 'peripheral' ? 'severity' : 'peripheral');
  }

  public async setFilters(filters: Partial<AnalysisFilterState>, sessionState?: AnalysisSessionState): Promise<void> {
    const next = this.normalizeFilters(
      {
        ...this.filters,
        ...filters,
        groups: filters.groups ?? this.filters.groups,
      },
      sessionState
    );

    if (this.areFiltersEqual(this.filters, next)) {
      return;
    }

    this.filters = next;
    await this.persist();
    this.onDidChangeEmitter.fire();
  }

  public async resetFilters(): Promise<void> {
    const next: AnalysisFilterState = {
      severity: 'all',
      status: 'all',
      groups: [],
    };
    if (this.areFiltersEqual(this.filters, next)) {
      return;
    }

    this.filters = next;
    await this.persist();
    this.onDidChangeEmitter.fire();
  }

  private normalizeFilters(filters: AnalysisFilterState, sessionState?: AnalysisSessionState): AnalysisFilterState {
    const availableGroups = new Set(sessionState?.groups.map(group => group.groupName) ?? []);
    const groups =
      availableGroups.size === 0
        ? []
        : Array.from(
            new Set(
              filters.groups.filter(
                group => typeof group === 'string' && group.length > 0 && availableGroups.has(group)
              )
            )
          ).sort((left, right) => left.localeCompare(right));

    return {
      severity: isSeverityFilter(filters.severity) ? filters.severity : 'all',
      status: isStatusFilter(filters.status) ? filters.status : 'all',
      groups,
    };
  }

  private areFiltersEqual(left: AnalysisFilterState, right: AnalysisFilterState): boolean {
    return (
      left.severity === right.severity &&
      left.status === right.status &&
      left.groups.length === right.groups.length &&
      left.groups.every((group, index) => group === right.groups[index])
    );
  }

  private async persist(): Promise<void> {
    const payload: StoredAnalysisUiState = {
      viewMode: this.viewMode,
      filters: this.filters,
    };
    await this.storage.update(this.storageKey, payload);
  }
}
