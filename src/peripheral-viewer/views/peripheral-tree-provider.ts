import * as vscode from 'vscode';
import { AnalysisResult } from '../analysis/types';
import { SvdAnalyzerRegistry } from '../analysis/analyzer';
import { AddrRange } from '../addrranges';
import { NodeSetting } from '../common';
import { ANALYSIS_RESULTS_KEY, DEBUG_TYPE, SESSION_STATE_KEY, VIEW_ID } from '../manifest';
import { PeripheralsProvider } from '../peripherals-provider';
import { BaseNode, PeripheralBaseNode } from './nodes/basenode';
import { MessageNode } from './nodes/messagenode';
import { PeripheralNode } from './nodes/peripheralnode';
import { PeripheralRegisterNode } from './nodes/peripheralregisternode';

interface PersistedLayoutStates {
  [svdPath: string]: NodeSetting[];
}

interface AnalysisResultSnapshot {
  severity: string;
  node: string | undefined;
  message: string;
  detail?: string;
  suggestedValue?: string;
}

interface PersistedAnalysisResults {
  [sessionId: string]: AnalysisResultSnapshot[];
}

class SessionPeripheralTree extends PeripheralBaseNode {
  public readonly treeItem: vscode.TreeItem;

  private peripherals: PeripheralNode[] = [];
  private loaded = false;
  private message = vscode.l10n.t('Loading peripheral definitions...');
  private svdPath?: string;
  private deviceName?: string;
  private lastAnalysisResults: AnalysisResult[] = [];

  constructor(
    public readonly session: vscode.DebugSession,
    state: vscode.TreeItemCollapsibleState,
    private readonly context: vscode.ExtensionContext,
    private readonly analyzerRegistry: SvdAnalyzerRegistry,
    private readonly fireChange: () => void
  ) {
    super();
    this.treeItem = new vscode.TreeItem(session.name, state);
    this.treeItem.contextValue = 'peripheral-session';
    this.treeItem.iconPath = new vscode.ThemeIcon('debug-alt');
  }

  public getPeripheral(): PeripheralBaseNode {
    throw new Error('Session nodes do not map to a peripheral.');
  }

  public collectRanges(_ary: AddrRange[]): void {
    throw new Error('Session nodes do not collect address ranges.');
  }

  public findByPath(_path: string[]): PeripheralBaseNode | undefined {
    return undefined;
  }

  public getCopyValue(): string | undefined {
    return undefined;
  }

  public performUpdate(): Thenable<boolean> {
    return Promise.resolve(false);
  }

  public async sessionStarted(provider: PeripheralsProvider): Promise<void> {
    this.peripherals = [];
    this.loaded = false;
    this.message = vscode.l10n.t('Loading peripheral definitions...');
    this.fireChange();

    try {
      const loaded = await provider.getPeripherals();
      this.peripherals = loaded.peripherals;
      this.svdPath = loaded.svdPath;
      this.deviceName = loaded.deviceName;
      this.loaded = true;
      this.message = '';
      await this.setSession(this.session);
      this.applySavedState();
      this.sortPeripherals();
      await this.runAnalysis();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.peripherals = [];
      this.loaded = false;
      this.message = message;
    } finally {
      this.fireChange();
    }
  }

  public async updateData(): Promise<boolean> {
    if (!this.loaded) {
      return false;
    }

    await Promise.allSettled(this.peripherals.map(peripheral => peripheral.updateData()));
    await this.runAnalysis();
    this.fireChange();
    return true;
  }

  public getTreeItem(element?: BaseNode): vscode.TreeItem | Promise<vscode.TreeItem> {
    return element ? element.getTreeItem() : this.treeItem;
  }

  public getChildren(element?: PeripheralBaseNode): PeripheralBaseNode[] | Promise<PeripheralBaseNode[]> {
    if (element) {
      return element.getChildren();
    }

    if (!this.loaded) {
      return [new MessageNode(this.message)];
    }

    return this.peripherals;
  }

  public saveState(): NodeSetting[] {
    return this.peripherals.flatMap(peripheral => peripheral.saveState());
  }

  public async persistLayoutState(): Promise<void> {
    if (!this.svdPath) {
      return;
    }

    const allStates = this.context.workspaceState.get<PersistedLayoutStates>(SESSION_STATE_KEY, {});
    allStates[this.svdPath] = this.saveState();
    await this.context.workspaceState.update(SESSION_STATE_KEY, allStates);
  }

  public async persistAnalysisResults(): Promise<void> {
    const stored = this.context.workspaceState.get<PersistedAnalysisResults>(ANALYSIS_RESULTS_KEY, {});
    stored[this.session.id] = this.lastAnalysisResults.map(result => ({
      severity: result.severity,
      node: result.node.name ?? '(unknown)',
      message: result.message,
      detail: result.detail,
      suggestedValue: result.suggestedValue,
    }));
    await this.context.workspaceState.update(ANALYSIS_RESULTS_KEY, stored);
  }

  public clearAnalysisResults(): Thenable<void> {
    const stored = this.context.workspaceState.get<PersistedAnalysisResults>(ANALYSIS_RESULTS_KEY, {});
    delete stored[this.session.id];
    this.lastAnalysisResults = [];
    return this.context.workspaceState.update(ANALYSIS_RESULTS_KEY, stored);
  }

  public async sessionTerminated(): Promise<void> {
    await this.persistLayoutState();
    await this.clearAnalysisResults();
  }

  public async setNodeFormat(node: PeripheralBaseNode, format: number): Promise<void> {
    node.format = format;
    await this.persistLayoutState();
  }

  public async refreshNode(node: PeripheralBaseNode): Promise<void> {
    const peripheral = node.getPeripheral();
    if (!peripheral) {
      return;
    }

    await peripheral.updateData();
    await this.runAnalysis();
    this.fireChange();
  }

  public async togglePinPeripheral(node: PeripheralBaseNode): Promise<void> {
    node.pinned = !node.pinned;
    this.sortPeripherals();
    await this.persistLayoutState();
  }

  public getDeviceName(): string | undefined {
    return this.deviceName;
  }

  private applySavedState(): void {
    if (!this.svdPath) {
      return;
    }

    const savedStates = this.context.workspaceState.get<PersistedLayoutStates>(SESSION_STATE_KEY, {});
    const state = savedStates[this.svdPath] ?? [];

    for (const nodeState of state) {
      const node = this.findNodeByPath(nodeState.node);
      if (!node) {
        continue;
      }

      node.expanded = nodeState.expanded ?? false;
      node.pinned = nodeState.pinned ?? false;
      if (nodeState.format !== undefined) {
        node.format = nodeState.format;
      }
    }
  }

  private findNodeByPath(path: string): PeripheralBaseNode | undefined {
    const pathParts = path.split('.');
    const peripheral = this.peripherals.find(candidate => candidate.name === pathParts[0]);
    if (!peripheral) {
      return undefined;
    }

    return peripheral.findByPath(pathParts.slice(1));
  }

  private sortPeripherals(): void {
    this.peripherals.sort(PeripheralNode.compare);
  }

  private async runAnalysis(): Promise<void> {
    if (!this.loaded) {
      this.lastAnalysisResults = [];
      await this.clearAnalysisResults();
      return;
    }

    this.lastAnalysisResults = await this.analyzerRegistry.runAll({
      peripherals: this.peripherals,
      deviceName: this.deviceName,
    });
    await this.persistAnalysisResults();
  }
}

export class PeripheralTreeProvider implements vscode.TreeDataProvider<PeripheralBaseNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<PeripheralBaseNode | undefined>();

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private readonly sessionTrees = new Map<string, SessionPeripheralTree>();
  private readonly previousStates = new Map<string, vscode.TreeItemCollapsibleState>();
  private readonly stoppedTimers = new Map<string, NodeJS.Timeout>();
  private treeView?: vscode.TreeView<PeripheralBaseNode>;
  private activeSessionId?: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly analyzerRegistry: SvdAnalyzerRegistry
  ) {}

  public activate(): vscode.Disposable {
    this.treeView = vscode.window.createTreeView(VIEW_ID, {
      treeDataProvider: this,
      showCollapseAll: true,
    });

    const disposables: vscode.Disposable[] = [
      this.treeView,
      this.treeView.onDidExpandElement(event => {
        event.element.expanded = true;
        void this.persistNodeState(event.element);
        if (!(event.element instanceof PeripheralRegisterNode)) {
          const tree = this.getTreeForSession(event.element.session);
          if (tree) {
            void tree.refreshNode(event.element).finally(() => {
              void this.refresh();
            });
          }
        }
      }),
      this.treeView.onDidCollapseElement(event => {
        event.element.expanded = false;
        void this.persistNodeState(event.element);
      }),
    ];

    return new vscode.Disposable(() => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
      for (const timer of this.stoppedTimers.values()) {
        clearTimeout(timer);
      }
      this.stoppedTimers.clear();
      this.sessionTrees.clear();
      this.onDidChangeTreeDataEmitter.dispose();
    });
  }

  public async refresh(): Promise<void> {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public async updateData(): Promise<void> {
    await Promise.allSettled(Array.from(this.sessionTrees.values()).map(tree => tree.updateData()));
    await this.refresh();
  }

  public getTreeItem(element: PeripheralBaseNode): vscode.TreeItem | Promise<vscode.TreeItem> {
    return element.getTreeItem();
  }

  public getChildren(element?: PeripheralBaseNode): vscode.ProviderResult<PeripheralBaseNode[]> {
    if (element) {
      return element.getChildren();
    }

    const activeTree = this.getActiveTree();
    if (activeTree) {
      return activeTree.getChildren();
    }

    return [
      new MessageNode(vscode.l10n.t('Peripheral Viewer is available when a sifli-probe-rs debug session is active.')),
    ];
  }

  public async onDebugSessionStarted(session: vscode.DebugSession): Promise<void> {
    if (session.type !== DEBUG_TYPE) {
      return;
    }

    const existingTree = this.sessionTrees.get(session.id);
    if (existingTree) {
      await existingTree.sessionStarted(new PeripheralsProvider(session));
      await this.refresh();
      return;
    }

    const previousState =
      this.previousStates.get(session.name) ??
      (this.sessionTrees.size === 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed);

    const sessionTree = new SessionPeripheralTree(session, previousState, this.context, this.analyzerRegistry, () => {
      this.onDidChangeTreeDataEmitter.fire(undefined);
    });

    this.sessionTrees.set(session.id, sessionTree);
    if (!this.activeSessionId || vscode.debug.activeDebugSession?.id === session.id) {
      this.activeSessionId = session.id;
    }

    await sessionTree.sessionStarted(new PeripheralsProvider(session));
    await this.refresh();
  }

  public async onDebugSessionTerminated(session: vscode.DebugSession): Promise<void> {
    const sessionTree = this.sessionTrees.get(session.id);
    if (!sessionTree) {
      return;
    }

    const timer = this.stoppedTimers.get(session.id);
    if (timer) {
      clearTimeout(timer);
      this.stoppedTimers.delete(session.id);
    }

    this.previousStates.set(
      session.name,
      sessionTree.treeItem.collapsibleState ?? vscode.TreeItemCollapsibleState.None
    );
    this.sessionTrees.delete(session.id);
    await sessionTree.sessionTerminated();

    if (this.activeSessionId === session.id) {
      this.activeSessionId = this.pickFallbackSessionId();
    }

    await this.refresh();
  }

  public onActiveSessionChanged(session: vscode.DebugSession | undefined): void {
    if (session?.type === DEBUG_TYPE && this.sessionTrees.has(session.id)) {
      this.activeSessionId = session.id;
    } else {
      this.activeSessionId = this.pickFallbackSessionId();
    }

    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public onDebugAdapterMessage(session: vscode.DebugSession, message: unknown): void {
    if (session.type !== DEBUG_TYPE || !this.sessionTrees.has(session.id)) {
      return;
    }

    const eventMessage = message as { type?: string; event?: string } | undefined;
    if (eventMessage?.type !== 'event') {
      return;
    }

    if (eventMessage.event === 'stopped') {
      this.onDebugStopped(session);
    } else if (eventMessage.event === 'continued') {
      this.onDebugContinued(session);
    }
  }

  public async forceRefreshNode(node?: PeripheralBaseNode): Promise<void> {
    if (!node) {
      await this.updateData();
      return;
    }

    const tree = this.getTreeForSession(node.session);
    if (tree) {
      await tree.refreshNode(node);
    }

    await this.refresh();
  }

  public async setNodeFormat(node: PeripheralBaseNode, format: number): Promise<void> {
    const tree = this.getTreeForSession(node.session);
    if (!tree) {
      return;
    }

    await tree.setNodeFormat(node, format);
    await this.refresh();
  }

  public async togglePinPeripheral(node: PeripheralBaseNode): Promise<void> {
    const tree = this.getTreeForSession(node.session);
    if (!tree) {
      return;
    }

    await tree.togglePinPeripheral(node);
    await this.refresh();
  }

  public async persistNodeState(node: PeripheralBaseNode): Promise<void> {
    const tree = this.getTreeForSession(node.session);
    if (!tree) {
      return;
    }

    await tree.persistLayoutState();
  }

  private onDebugStopped(session: vscode.DebugSession): void {
    const existingTimer = this.stoppedTimers.get(session.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.stoppedTimers.delete(session.id);
      const tree = this.sessionTrees.get(session.id);
      if (!tree) {
        return;
      }

      void tree.updateData();
    }, 100);

    this.stoppedTimers.set(session.id, timer);
  }

  private onDebugContinued(session: vscode.DebugSession): void {
    const timer = this.stoppedTimers.get(session.id);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.stoppedTimers.delete(session.id);
  }

  private getActiveTree(): SessionPeripheralTree | undefined {
    const byActiveId = this.activeSessionId ? this.sessionTrees.get(this.activeSessionId) : undefined;
    if (byActiveId) {
      return byActiveId;
    }

    const fallbackId = this.pickFallbackSessionId();
    if (!fallbackId) {
      return undefined;
    }

    this.activeSessionId = fallbackId;
    return this.sessionTrees.get(fallbackId);
  }

  private pickFallbackSessionId(): string | undefined {
    return this.sessionTrees.keys().next().value;
  }

  private getTreeForSession(session: vscode.DebugSession | undefined): SessionPeripheralTree | undefined {
    if (!session) {
      return undefined;
    }

    return this.sessionTrees.get(session.id);
  }
}
