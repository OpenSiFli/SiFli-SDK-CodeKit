import * as vscode from 'vscode';
import { ANALYSIS_VIEW_ID } from '../manifest';
import { AnalysisFinding, AnalysisGroupResult, AnalysisInstanceResult, AnalysisSessionState } from './types';
import { PeripheralAnalysisRuntime } from './runtime';

type AnalysisTreeNode = AnalysisMessageNode | AnalysisGroupNode | AnalysisInstanceNode | AnalysisFindingNode;

class AnalysisMessageNode {
  public readonly kind = 'message';
  public readonly contextValue = 'peripheral-analysis-message';

  constructor(public readonly label: string) {}
}

class AnalysisGroupNode {
  public readonly kind = 'group';
  public readonly contextValue = 'peripheral-analysis-group';

  constructor(public readonly result: AnalysisGroupResult) {}
}

class AnalysisInstanceNode {
  public readonly kind = 'instance';
  public readonly contextValue = 'peripheral-analysis-instance';

  constructor(
    public readonly groupName: string,
    public readonly result: AnalysisInstanceResult
  ) {}
}

class AnalysisFindingNode {
  public readonly kind = 'finding';
  public readonly contextValue = 'peripheral-analysis-finding';

  constructor(
    public readonly peripheralName: string,
    public readonly finding: AnalysisFinding
  ) {}
}

export class PeripheralAnalysisViewProvider implements vscode.TreeDataProvider<AnalysisTreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<AnalysisTreeNode | undefined | void>();

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly runtime: PeripheralAnalysisRuntime) {}

  public activate(): vscode.Disposable {
    const view = vscode.window.createTreeView(ANALYSIS_VIEW_ID, {
      treeDataProvider: this,
      showCollapseAll: true,
    });

    return new vscode.Disposable(() => {
      view.dispose();
      this.onDidChangeTreeDataEmitter.dispose();
    });
  }

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  public getTreeItem(element: AnalysisTreeNode): vscode.TreeItem {
    if (element.kind === 'message') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.contextValue = element.contextValue;
      return item;
    }

    if (element.kind === 'group') {
      const item = new vscode.TreeItem(
        element.result.groupName,
        element.result.instances.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None
      );
      item.contextValue = element.contextValue;
      item.description = this.describeGroup(element.result);
      item.iconPath = new vscode.ThemeIcon(this.iconForInstances(element.result.instances));
      return item;
    }

    if (element.kind === 'instance') {
      const item = new vscode.TreeItem(
        element.result.peripheralName,
        element.result.findings.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None
      );
      item.contextValue = element.contextValue;
      item.description = this.describeInstance(element.result);
      item.iconPath = new vscode.ThemeIcon(this.iconForInstance(element.result));
      return item;
    }

    const item = new vscode.TreeItem(element.finding.message, vscode.TreeItemCollapsibleState.None);
    item.contextValue = element.contextValue;
    item.description = element.finding.suggestion;
    item.tooltip = this.tooltipForFinding(element.finding);
    item.iconPath = new vscode.ThemeIcon(this.iconForFinding(element.finding));
    return item;
  }

  public getChildren(element?: AnalysisTreeNode): AnalysisTreeNode[] {
    const state = this.runtime.getActiveSessionState();
    if (!state) {
      return [
        new AnalysisMessageNode(
          vscode.l10n.t('Peripheral analysis is available when a sifli-probe-rs debug session is active.')
        ),
      ];
    }

    if (state.message) {
      return [new AnalysisMessageNode(state.message)];
    }

    if (!element) {
      if (state.groups.length === 0) {
        return [
          new AnalysisMessageNode(
            vscode.l10n.t('No peripheral analysis groups are available for the current session.')
          ),
        ];
      }
      return state.groups.map(group => new AnalysisGroupNode(group));
    }

    if (element.kind === 'group') {
      return element.result.instances.map(instance => new AnalysisInstanceNode(element.result.groupName, instance));
    }

    if (element.kind === 'instance') {
      if (element.result.findings.length === 0) {
        return [new AnalysisMessageNode(vscode.l10n.t('No issues found.'))];
      }
      return element.result.findings.map(finding => new AnalysisFindingNode(element.result.peripheralName, finding));
    }

    return [];
  }

  private describeGroup(group: AnalysisGroupResult): string {
    const pending = group.instances.filter(instance => instance.status === 'not-analyzed').length;
    const issues = group.instances.reduce((count, instance) => count + instance.findings.length, 0);
    if (pending === group.instances.length) {
      return vscode.l10n.t('Not analyzed');
    }
    if (issues === 0) {
      return vscode.l10n.t('OK');
    }
    return vscode.l10n.t('{0} findings', String(issues));
  }

  private describeInstance(instance: AnalysisInstanceResult): string {
    if (instance.status === 'not-analyzed') {
      return vscode.l10n.t('Not analyzed');
    }
    if (instance.findings.length === 0) {
      return vscode.l10n.t('OK');
    }
    return vscode.l10n.t('{0} findings', String(instance.findings.length));
  }

  private iconForInstances(instances: AnalysisInstanceResult[]): string {
    const severities = instances.flatMap(instance => instance.findings.map(finding => finding.severity));
    if (severities.includes('error' as any)) {
      return 'error';
    }
    if (severities.includes('warning' as any)) {
      return 'warning';
    }
    if (instances.every(instance => instance.status === 'not-analyzed')) {
      return 'circle-large-outline';
    }
    return 'pass';
  }

  private iconForInstance(instance: AnalysisInstanceResult): string {
    if (instance.status === 'not-analyzed') {
      return 'circle-large-outline';
    }
    return this.iconForFindings(instance.findings);
  }

  private iconForFindings(findings: AnalysisFinding[]): string {
    if (findings.some(finding => finding.severity === 'error')) {
      return 'error';
    }
    if (findings.some(finding => finding.severity === 'warning')) {
      return 'warning';
    }
    if (findings.some(finding => finding.severity === 'info')) {
      return 'info';
    }
    return 'pass';
  }

  private iconForFinding(finding: AnalysisFinding): string {
    switch (finding.severity) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  }

  private tooltipForFinding(finding: AnalysisFinding): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString('', true);
    markdown.appendMarkdown(`**${finding.message}**`);
    if (finding.suggestion) {
      markdown.appendMarkdown(`\n\n${finding.suggestion}`);
    }
    if (finding.relatedRegister) {
      markdown.appendMarkdown(`\n\n${vscode.l10n.t('Register')}: \`${finding.relatedRegister}\``);
    }
    return markdown;
  }
}
