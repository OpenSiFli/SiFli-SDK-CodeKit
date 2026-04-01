import * as vscode from 'vscode';
import { ANALYSIS_VIEW_ID } from '../manifest';
import { ANALYSIS_FILTER_EMPTY_MESSAGE, buildAnalysisPresentation } from './presentation';
import { PeripheralAnalysisRuntime } from './runtime';
import {
  AnalysisBucketId,
  AnalysisBucketPresentation,
  AnalysisFilterState,
  AnalysisFindingPresentation,
  AnalysisGroupPresentation,
  AnalysisInstancePresentation,
  AnalysisPresentationSnapshot,
  AnalysisSeverity,
} from './types';
import { PeripheralAnalysisUiState } from './ui-state';

type AnalysisTreeNode =
  | AnalysisMessageNode
  | AnalysisBucketNode
  | AnalysisGroupNode
  | AnalysisInstanceNode
  | AnalysisFindingNode;

class AnalysisMessageNode {
  public readonly kind = 'message';
  public readonly contextValue = 'peripheral-analysis-message';

  constructor(public readonly label: string) {}
}

class AnalysisBucketNode {
  public readonly kind = 'bucket';
  public readonly contextValue = 'peripheral-analysis-bucket';

  constructor(public readonly bucket: AnalysisBucketPresentation) {}
}

class AnalysisGroupNode {
  public readonly kind = 'group';
  public readonly contextValue = 'peripheral-analysis-group';

  constructor(public readonly group: AnalysisGroupPresentation) {}
}

class AnalysisInstanceNode {
  public readonly kind = 'instance';
  public readonly contextValue = 'peripheral-analysis-instance';

  constructor(public readonly instance: AnalysisInstancePresentation) {}
}

class AnalysisFindingNode {
  public readonly kind = 'finding';
  public readonly contextValue = 'peripheral-analysis-finding';

  constructor(public readonly finding: AnalysisFindingPresentation) {}
}

export class PeripheralAnalysisViewProvider implements vscode.TreeDataProvider<AnalysisTreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<AnalysisTreeNode | undefined | void>();
  private view?: vscode.TreeView<AnalysisTreeNode>;

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly runtime: PeripheralAnalysisRuntime,
    private readonly uiState: PeripheralAnalysisUiState
  ) {}

  public activate(): vscode.Disposable {
    this.view = vscode.window.createTreeView(ANALYSIS_VIEW_ID, {
      treeDataProvider: this,
      showCollapseAll: true,
    });
    this.updateViewMetadata();
    const localeChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('locale')) {
        this.refresh();
      }
    });

    return new vscode.Disposable(() => {
      localeChangeListener.dispose();
      this.view?.dispose();
      this.view = undefined;
      this.onDidChangeTreeDataEmitter.dispose();
    });
  }

  public refresh(): void {
    this.updateViewMetadata();
    this.onDidChangeTreeDataEmitter.fire();
  }

  public getTreeItem(element: AnalysisTreeNode): vscode.TreeItem {
    if (element.kind === 'message') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.contextValue = element.contextValue;
      return item;
    }

    if (element.kind === 'bucket') {
      const item = new vscode.TreeItem(
        element.bucket.label,
        element.bucket.groups.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None
      );
      item.contextValue = element.contextValue;
      item.description = this.describeCounts(element.bucket);
      item.iconPath = new vscode.ThemeIcon(this.iconForBucket(element.bucket.id));
      return item;
    }

    if (element.kind === 'group') {
      const item = new vscode.TreeItem(
        element.group.groupName,
        element.group.instances.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None
      );
      item.contextValue = element.contextValue;
      item.description = this.describeCounts(element.group);
      item.iconPath = new vscode.ThemeIcon(this.iconForGroup(element.group));
      return item;
    }

    if (element.kind === 'instance') {
      const item = new vscode.TreeItem(
        element.instance.peripheralName,
        element.instance.findings.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None
      );
      item.contextValue = element.contextValue;
      item.description = this.describeCounts(element.instance);
      item.iconPath = new vscode.ThemeIcon(this.iconForInstance(element.instance));
      return item;
    }

    const item = new vscode.TreeItem(this.labelForFinding(element.finding), vscode.TreeItemCollapsibleState.None);
    item.contextValue = element.contextValue;
    item.description = element.finding.relatedRegister ?? element.finding.peripheralName;
    item.tooltip = this.tooltipForFinding(element.finding);
    item.iconPath = new vscode.ThemeIcon(this.iconForFinding(element.finding));
    return item;
  }

  public getChildren(element?: AnalysisTreeNode): AnalysisTreeNode[] {
    const snapshot = this.getSnapshot();
    if (!element) {
      if (snapshot.message && snapshot.groups.length === 0 && snapshot.buckets.length === 0) {
        return [new AnalysisMessageNode(snapshot.message)];
      }

      if (snapshot.viewMode === 'severity') {
        return snapshot.buckets.map(bucket => new AnalysisBucketNode(bucket));
      }

      return snapshot.groups.map(group => new AnalysisGroupNode(group));
    }

    if (element.kind === 'bucket') {
      return element.bucket.groups.map(group => new AnalysisGroupNode(group));
    }

    if (element.kind === 'group') {
      return element.group.instances.map(instance => new AnalysisInstanceNode(instance));
    }

    if (element.kind === 'instance') {
      if (element.instance.findings.length === 0) {
        if (element.instance.status === 'ok') {
          return [new AnalysisMessageNode(vscode.l10n.t('No issues found.'))];
        }
        if (element.instance.status === 'not-analyzed') {
          return [new AnalysisMessageNode(vscode.l10n.t('Run analysis to inspect this peripheral.'))];
        }
      }

      return element.instance.findings.map(finding => new AnalysisFindingNode(finding));
    }

    return [];
  }

  private getSnapshot(): AnalysisPresentationSnapshot {
    const sessionState = this.runtime.getActiveSessionState();
    const filters = this.uiState.getFilters(sessionState);
    return buildAnalysisPresentation(sessionState, this.uiState.getViewMode(), filters);
  }

  private updateViewMetadata(): void {
    if (!this.view) {
      return;
    }

    const snapshot = this.getSnapshot();
    this.view.description = this.describeView(snapshot);
    this.view.badge =
      snapshot.summary.issueCount > 0
        ? {
            value: snapshot.summary.issueCount,
            tooltip: vscode.l10n.t(
              'Visible findings: {0} (errors: {1}, warnings: {2})',
              String(snapshot.summary.issueCount),
              String(snapshot.summary.errorCount),
              String(snapshot.summary.warningCount)
            ),
          }
        : undefined;
    this.view.message =
      snapshot.hasActiveSession &&
      snapshot.summary.visibleGroups === 0 &&
      snapshot.message === vscode.l10n.t(ANALYSIS_FILTER_EMPTY_MESSAGE)
        ? snapshot.message
        : undefined;
  }

  private describeView(snapshot: AnalysisPresentationSnapshot): string | undefined {
    if (!snapshot.hasActiveSession) {
      return undefined;
    }

    const parts: string[] = [this.describeFilters(snapshot.filters, snapshot.availableGroups)];
    if (snapshot.summary.visibleGroups > 0) {
      parts.push(vscode.l10n.t('{0} groups', String(snapshot.summary.visibleGroups)));
    }

    const counts = [];
    if (snapshot.summary.errorCount > 0) {
      counts.push(`E${snapshot.summary.errorCount}`);
    }
    if (snapshot.summary.warningCount > 0) {
      counts.push(`W${snapshot.summary.warningCount}`);
    }
    if (snapshot.summary.cleanCount > 0 && snapshot.filters.severity === 'all') {
      counts.push(`OK${snapshot.summary.cleanCount}`);
    }
    if (snapshot.summary.notAnalyzedCount > 0 && snapshot.filters.severity === 'all') {
      counts.push(`P${snapshot.summary.notAnalyzedCount}`);
    }

    if (counts.length > 0) {
      parts.push(counts.join(' '));
    }

    return parts.filter(part => part.length > 0).join(' | ') || undefined;
  }

  private describeFilters(filters: AnalysisFilterState, availableGroups: string[]): string {
    const parts: string[] = [];
    if (filters.severity === AnalysisSeverity.Error) {
      parts.push(vscode.l10n.t('Errors'));
    } else if (filters.severity === AnalysisSeverity.Warning) {
      parts.push(vscode.l10n.t('Warnings'));
    } else {
      parts.push(vscode.l10n.t('All'));
    }

    if (filters.status === 'issues') {
      parts.push(vscode.l10n.t('Issues'));
    } else if (filters.status === 'clean') {
      parts.push(vscode.l10n.t('Clean'));
    }

    if (filters.groups.length > 0) {
      parts.push(vscode.l10n.t('{0}/{1} groups', String(filters.groups.length), String(availableGroups.length)));
    }

    return parts.join(' · ');
  }

  private describeCounts(entry: {
    errorCount: number;
    warningCount: number;
    issueCount: number;
    cleanCount: number;
    notAnalyzedCount: number;
  }): string {
    const parts = [];
    if (entry.errorCount > 0) {
      parts.push(`E${entry.errorCount}`);
    }
    if (entry.warningCount > 0) {
      parts.push(`W${entry.warningCount}`);
    }
    if (entry.issueCount === 0 && entry.cleanCount > 0 && entry.notAnalyzedCount === 0) {
      parts.push(vscode.l10n.t('Clean'));
    }
    if (entry.notAnalyzedCount > 0 && entry.issueCount === 0 && entry.cleanCount === 0) {
      parts.push(vscode.l10n.t('Not analyzed'));
    }
    if (entry.cleanCount > 0 && entry.issueCount > 0) {
      parts.push(`OK${entry.cleanCount}`);
    }
    if (entry.notAnalyzedCount > 0 && (entry.issueCount > 0 || entry.cleanCount > 0)) {
      parts.push(`P${entry.notAnalyzedCount}`);
    }

    return parts.join(' ') || vscode.l10n.t('Clean');
  }

  private iconForBucket(bucketId: AnalysisBucketId): string {
    switch (bucketId) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'clean':
        return 'pass';
      default:
        return 'circle-large-outline';
    }
  }

  private iconForGroup(group: AnalysisGroupPresentation): string {
    if (group.errorCount > 0) {
      return 'error';
    }
    if (group.warningCount > 0) {
      return 'warning';
    }
    if (group.notAnalyzedCount > 0 && group.issueCount === 0 && group.cleanCount === 0) {
      return 'circle-large-outline';
    }
    return 'pass';
  }

  private iconForInstance(instance: AnalysisInstancePresentation): string {
    if (instance.errorCount > 0) {
      return 'error';
    }
    if (instance.warningCount > 0) {
      return 'warning';
    }
    if (instance.status === 'not-analyzed') {
      return 'circle-large-outline';
    }
    return 'pass';
  }

  private iconForFinding(finding: AnalysisFindingPresentation): string {
    switch (finding.severity) {
      case AnalysisSeverity.Error:
        return 'error';
      case AnalysisSeverity.Warning:
        return 'warning';
      default:
        return 'info';
    }
  }

  private labelForFinding(finding: AnalysisFindingPresentation): string {
    const prefix =
      finding.severity === AnalysisSeverity.Error
        ? vscode.l10n.t('Error')
        : finding.severity === AnalysisSeverity.Warning
          ? vscode.l10n.t('Warning')
          : vscode.l10n.t('Info');
    return `${prefix}: ${finding.message}`;
  }

  private tooltipForFinding(finding: AnalysisFindingPresentation): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString('', true);
    markdown.appendMarkdown(`**${this.labelForFinding(finding)}**`);
    markdown.appendMarkdown(`\n\n${vscode.l10n.t('Peripheral')}: \`${finding.peripheralName}\``);
    markdown.appendMarkdown(`\n\n${vscode.l10n.t('Group')}: \`${finding.groupName}\``);
    if (finding.suggestion) {
      markdown.appendMarkdown(`\n\n${finding.suggestion}`);
    }
    if (finding.relatedRegister) {
      markdown.appendMarkdown(`\n\n${vscode.l10n.t('Register')}: \`${finding.relatedRegister}\``);
    }
    return markdown;
  }
}
