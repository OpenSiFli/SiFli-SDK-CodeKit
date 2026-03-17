import * as path from 'path';
import * as vscode from 'vscode';
import { SIFLI_PROJECT_CONTEXT_KEY } from '../constants';
import { BuildCommands } from '../commands/buildCommands';
import {
  SdkDependencyEntry,
  SdkDependencyIndexService,
  SdkDependencyProjectEntries,
  SdkDependencySnapshot,
} from '../services/sdkDependencyIndexService';
import { WorkspaceStateService, WORKSPACE_STATE_KEYS } from '../services/workspaceStateService';
import { getProjectInfo } from '../utils/projectUtils';

type DependencyNodeKind = 'state' | 'project' | 'folder' | 'file' | 'unresolved-group';

interface DependencyExplorerNode {
  kind: DependencyNodeKind;
  id: string;
  label: string;
  parent?: DependencyExplorerNode;
  children: DependencyExplorerNode[];
  description?: string;
  tooltip?: string;
  icon?: string;
  commandId?: string;
  resourceUri?: vscode.Uri;
  entry?: SdkDependencyEntry;
  relativePath?: string;
}

export class SdkDependencyExplorerProvider implements vscode.TreeDataProvider<DependencyExplorerNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<DependencyExplorerNode | undefined | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly dependencyIndexService: SdkDependencyIndexService;
  private currentSnapshot?: SdkDependencySnapshot;
  private rootNodes: DependencyExplorerNode[] = [];
  private readonly fileNodeIndex = new Map<string, DependencyExplorerNode[]>();

  constructor() {
    this.dependencyIndexService = SdkDependencyIndexService.getInstance();
  }

  public refresh(): void {
    this.dependencyIndexService.invalidateCache();
    this.currentSnapshot = undefined;
    this.rootNodes = [];
    this.fileNodeIndex.clear();
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: DependencyExplorerNode): vscode.TreeItem {
    const collapsibleState =
      element.kind === 'project'
        ? vscode.TreeItemCollapsibleState.Expanded
        : element.children.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(element.label, collapsibleState);

    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.tooltip ?? element.label;

    if (element.resourceUri) {
      item.resourceUri = element.resourceUri;
      item.command = {
        command: 'vscode.open',
        title: vscode.l10n.t('Open SDK dependency file'),
        arguments: [element.resourceUri],
      };
    } else if (element.commandId) {
      item.command = {
        command: element.commandId,
        title: element.label,
      };
    }

    if (element.icon && !element.resourceUri) {
      item.iconPath = new vscode.ThemeIcon(element.icon);
    }

    return item;
  }

  public async getChildren(element?: DependencyExplorerNode): Promise<DependencyExplorerNode[]> {
    await this.ensureTree();
    return element ? element.children : this.rootNodes;
  }

  public getParent(element: DependencyExplorerNode): DependencyExplorerNode | undefined {
    return element.parent;
  }

  public async revealFile(targetPath: string, treeView: vscode.TreeView<DependencyExplorerNode>): Promise<boolean> {
    const normalizedPath = path.normalize(targetPath);
    await this.ensureTree();

    const candidates = this.fileNodeIndex.get(normalizedPath);
    const node = candidates?.[0];
    if (!node) {
      return false;
    }

    try {
      await treeView.reveal(node, { select: true, focus: false, expand: true });
      return true;
    } catch {
      return false;
    }
  }

  private async ensureTree(): Promise<void> {
    const snapshot = await this.dependencyIndexService.getSnapshot();
    if (snapshot === this.currentSnapshot) {
      return;
    }

    this.currentSnapshot = snapshot;
    this.fileNodeIndex.clear();
    this.rootNodes =
      snapshot.status === 'ready' ? this.buildProjectNodes(snapshot.projects) : this.buildStateNodes(snapshot);
  }

  private buildProjectNodes(projects: SdkDependencyProjectEntries[]): DependencyExplorerNode[] {
    return projects.map(project => {
      const mergedEntries = [...project.sources, ...project.headers].sort((left, right) => {
        const leftKey = left.resolution.relativePath ?? left.originalPath;
        const rightKey = right.resolution.relativePath ?? right.originalPath;
        return leftKey.localeCompare(rightKey, undefined, { numeric: true, sensitivity: 'base' });
      });

      const projectNode: DependencyExplorerNode = {
        kind: 'project',
        id: `project:${project.fullName}`,
        label: project.fullName,
        description: String(mergedEntries.length),
        tooltip: vscode.l10n.t('{0}: {1} files', project.fullName, String(mergedEntries.length)),
        icon: 'project',
        children: [],
      };

      const resolvedEntries = mergedEntries.filter(entry => entry.resolution.status === 'resolved');
      const unresolvedEntries = mergedEntries.filter(entry => entry.resolution.status === 'unresolved');
      projectNode.children = [
        ...this.buildDirectoryChildren(projectNode, resolvedEntries),
        ...this.buildUnresolvedGroup(projectNode, unresolvedEntries),
      ];

      return projectNode;
    });
  }

  private buildDirectoryChildren(
    parent: DependencyExplorerNode,
    entries: SdkDependencyEntry[]
  ): DependencyExplorerNode[] {
    const rootFolders = new Map<string, DependencyExplorerNode>();
    const rootFiles: DependencyExplorerNode[] = [];

    for (const entry of entries) {
      const resolvedPath = entry.resolution.resolvedPath;
      const relativePath = entry.resolution.relativePath;
      if (!resolvedPath || !relativePath) {
        continue;
      }

      const segments = relativePath.split(path.sep).filter(segment => segment.length > 0);
      if (segments.length <= 1) {
        rootFiles.push(this.createFileNode(parent, entry));
        continue;
      }

      let currentParent = parent;
      let currentFolderMap = rootFolders;

      for (const segment of segments.slice(0, -1)) {
        const nextRelativePath = currentParent.relativePath ? path.join(currentParent.relativePath, segment) : segment;
        let folderNode = currentFolderMap.get(nextRelativePath);
        if (!folderNode) {
          folderNode = {
            kind: 'folder',
            id: `folder:${parent.id}:${nextRelativePath}`,
            label: segment,
            parent: currentParent,
            relativePath: nextRelativePath,
            tooltip: nextRelativePath,
            icon: 'folder',
            children: [],
          };
          currentFolderMap.set(nextRelativePath, folderNode);
          currentParent.children.push(folderNode);
        }

        currentParent = folderNode;
        currentFolderMap = this.getChildFolderMap(folderNode);
      }

      currentParent.children.push(this.createFileNode(currentParent, entry));
    }

    parent.children.push(...rootFiles);
    this.sortChildrenRecursive(parent);
    return parent.children;
  }

  private buildUnresolvedGroup(
    parent: DependencyExplorerNode,
    entries: SdkDependencyEntry[]
  ): DependencyExplorerNode[] {
    if (entries.length === 0) {
      return [];
    }

    const unresolvedGroup: DependencyExplorerNode = {
      kind: 'unresolved-group',
      id: `unresolved:${parent.id}`,
      label: vscode.l10n.t('Unresolved'),
      description: String(entries.length),
      tooltip: vscode.l10n.t('Files that could not be mapped into the current SDK.'),
      icon: 'warning',
      parent,
      children: entries.map(entry => ({
        kind: 'file',
        id: `file:${parent.id}:${entry.originalPath}`,
        label: entry.label,
        description: vscode.l10n.t('Unresolved'),
        tooltip: entry.resolution.reason ?? entry.originalPath,
        icon: 'warning',
        parent: undefined,
        children: [],
        entry,
      })),
    };

    unresolvedGroup.children.forEach(child => {
      child.parent = unresolvedGroup;
    });

    return [unresolvedGroup];
  }

  private createFileNode(parent: DependencyExplorerNode, entry: SdkDependencyEntry): DependencyExplorerNode {
    const resourceUri = entry.resolution.resolvedPath ? vscode.Uri.file(entry.resolution.resolvedPath) : undefined;
    const node: DependencyExplorerNode = {
      kind: 'file',
      id: `file:${parent.id}:${entry.resolution.relativePath ?? entry.originalPath}`,
      label: entry.label,
      tooltip: entry.resolution.resolvedPath ?? entry.originalPath,
      parent,
      resourceUri,
      children: [],
      entry,
    };

    if (entry.resolution.resolvedPath) {
      const normalizedResolvedPath = path.normalize(entry.resolution.resolvedPath);
      const existingNodes = this.fileNodeIndex.get(normalizedResolvedPath) ?? [];
      existingNodes.push(node);
      this.fileNodeIndex.set(normalizedResolvedPath, existingNodes);
    }

    return node;
  }

  private getChildFolderMap(node: DependencyExplorerNode): Map<string, DependencyExplorerNode> {
    if (!(node as DependencyExplorerNode & { folderMap?: Map<string, DependencyExplorerNode> }).folderMap) {
      (node as DependencyExplorerNode & { folderMap?: Map<string, DependencyExplorerNode> }).folderMap = new Map();
    }
    return (node as DependencyExplorerNode & { folderMap: Map<string, DependencyExplorerNode> }).folderMap;
  }

  private sortChildrenRecursive(node: DependencyExplorerNode): void {
    node.children.sort((left, right) => {
      if (left.kind === 'folder' && right.kind !== 'folder') {
        return -1;
      }
      if (left.kind !== 'folder' && right.kind === 'folder') {
        return 1;
      }
      if (left.kind === 'unresolved-group' && right.kind !== 'unresolved-group') {
        return 1;
      }
      if (left.kind !== 'unresolved-group' && right.kind === 'unresolved-group') {
        return -1;
      }
      return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' });
    });

    for (const child of node.children) {
      this.sortChildrenRecursive(child);
    }
  }

  private buildStateNodes(snapshot: SdkDependencySnapshot): DependencyExplorerNode[] {
    const stateNode = this.createStateNode(snapshot);
    return stateNode ? [stateNode] : [];
  }

  private createStateNode(snapshot: SdkDependencySnapshot): DependencyExplorerNode | undefined {
    switch (snapshot.status) {
      case 'not-project':
        return {
          kind: 'state',
          id: 'state:not-project',
          label: snapshot.message,
          tooltip: snapshot.message,
          icon: 'info',
          children: [],
        };
      case 'board-not-selected':
        return {
          kind: 'state',
          id: 'state:board-not-selected',
          label: snapshot.message,
          description: vscode.l10n.t('Select board'),
          tooltip: snapshot.message,
          icon: 'circuit-board',
          commandId: 'extension.selectChipModule',
          children: [],
        };
      case 'sdk-not-selected':
      case 'sdk-invalid':
        return {
          kind: 'state',
          id: `state:${snapshot.status}`,
          label: snapshot.message,
          description: vscode.l10n.t('Switch SDK'),
          tooltip: snapshot.message,
          icon: 'package',
          commandId: 'extension.switchSdkVersion',
          children: [],
        };
      case 'unsupported':
        return {
          kind: 'state',
          id: 'state:unsupported',
          label: snapshot.message,
          description: vscode.l10n.t('Open SDK Manager'),
          tooltip: snapshot.message,
          icon: 'warning',
          commandId: 'extension.manageSiFliSdk',
          children: [],
        };
      case 'index-missing':
        return {
          kind: 'state',
          id: 'state:index-missing',
          label: snapshot.message,
          description: vscode.l10n.t('Generate'),
          tooltip: snapshot.indexPath ?? snapshot.message,
          icon: 'symbol-file',
          commandId: 'extension.generateCodebaseIndex',
          children: [],
        };
      case 'index-invalid':
      case 'empty':
        return {
          kind: 'state',
          id: `state:${snapshot.status}`,
          label: snapshot.message,
          description: vscode.l10n.t('Refresh'),
          tooltip: snapshot.indexPath ?? snapshot.message,
          icon: snapshot.status === 'index-invalid' ? 'warning' : 'info',
          commandId: 'extension.refreshSdkDependencies',
          children: [],
        };
      default:
        return undefined;
    }
  }
}

export class SdkDependencyExplorerManager {
  private static instance: SdkDependencyExplorerManager;
  private readonly provider: SdkDependencyExplorerProvider;
  private readonly treeView: vscode.TreeView<DependencyExplorerNode>;
  private readonly dependencyIndexService: SdkDependencyIndexService;
  private readonly buildCommands: BuildCommands;
  private fileWatcher?: vscode.FileSystemWatcher;
  private compileCommandsWatcher?: vscode.FileSystemWatcher;
  private readonly attemptedAutoGenerateKeys = new Set<string>();
  private activeAutoGenerateKey?: string;

  private constructor() {
    this.provider = new SdkDependencyExplorerProvider();
    this.dependencyIndexService = SdkDependencyIndexService.getInstance();
    this.buildCommands = BuildCommands.getInstance();
    this.treeView = vscode.window.createTreeView('sifliSdkDependenciesExplorer', {
      treeDataProvider: this.provider,
      showCollapseAll: true,
    });
  }

  public static getInstance(): SdkDependencyExplorerManager {
    if (!SdkDependencyExplorerManager.instance) {
      SdkDependencyExplorerManager.instance = new SdkDependencyExplorerManager();
    }
    return SdkDependencyExplorerManager.instance;
  }

  public refresh(): void {
    this.provider.refresh();
    void this.maybeAutoGenerate();
    void this.revealActiveEditor(vscode.window.activeTextEditor);
  }

  public register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.treeView);

    const workspaceStateListener = WorkspaceStateService.getInstance().onDidChangeState(event => {
      if (
        event.key === WORKSPACE_STATE_KEYS.DEFAULT_CHIP_MODULE ||
        event.key === WORKSPACE_STATE_KEYS.CURRENT_SDK_PATH
      ) {
        this.refresh();
      }
    });
    context.subscriptions.push(workspaceStateListener);

    const configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('sifli-sdk-codekit')) {
        this.refresh();
      }
    });
    context.subscriptions.push(configChangeListener);

    const workspaceFolderListener = vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await vscode.commands.executeCommand('setContext', SIFLI_PROJECT_CONTEXT_KEY, !!getProjectInfo());
      this.registerFileWatcher(context);
      this.refresh();
    });
    context.subscriptions.push(workspaceFolderListener);

    const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(editor => {
      void this.revealActiveEditor(editor);
    });
    context.subscriptions.push(activeEditorListener);

    const visibilityListener = this.treeView.onDidChangeVisibility(event => {
      if (event.visible) {
        void this.maybeAutoGenerate();
        void this.revealActiveEditor(vscode.window.activeTextEditor);
      }
    });
    context.subscriptions.push(visibilityListener);

    this.registerFileWatcher(context);
    void this.maybeAutoGenerate();
    void this.revealActiveEditor(vscode.window.activeTextEditor);
  }

  public dispose(): void {
    this.fileWatcher?.dispose();
    this.compileCommandsWatcher?.dispose();
    this.treeView.dispose();
  }

  private async revealActiveEditor(editor: vscode.TextEditor | undefined): Promise<void> {
    if (!editor || editor.document.uri.scheme !== 'file') {
      return;
    }

    await this.provider.revealFile(editor.document.uri.fsPath, this.treeView);
  }

  private async maybeAutoGenerate(): Promise<void> {
    const snapshot = await this.dependencyIndexService.getSnapshot();
    const autoGenerateKey = snapshot.autoGenerateKey;
    if (!snapshot.shouldAutoGenerate || !autoGenerateKey) {
      return;
    }

    if (this.activeAutoGenerateKey === autoGenerateKey || this.attemptedAutoGenerateKeys.has(autoGenerateKey)) {
      return;
    }

    this.attemptedAutoGenerateKeys.add(autoGenerateKey);
    this.activeAutoGenerateKey = autoGenerateKey;

    try {
      const succeeded = await this.buildCommands.executeGenerateCodebaseIndexTask({
        showSuccessNotification: false,
        showFailureNotification: true,
      });
      if (succeeded) {
        this.attemptedAutoGenerateKeys.delete(autoGenerateKey);
        this.provider.refresh();
        await this.revealActiveEditor(vscode.window.activeTextEditor);
      }
    } finally {
      if (this.activeAutoGenerateKey === autoGenerateKey) {
        this.activeAutoGenerateKey = undefined;
      }
    }
  }

  private registerFileWatcher(context: vscode.ExtensionContext): void {
    this.fileWatcher?.dispose();
    this.fileWatcher = undefined;
    this.compileCommandsWatcher?.dispose();
    this.compileCommandsWatcher = undefined;

    const projectInfo = getProjectInfo();
    if (!projectInfo) {
      return;
    }

    const pattern = new vscode.RelativePattern(
      projectInfo.workspaceRoot,
      `${projectInfo.projectEntryRelativePath}/build_*_hcpu/codebase_index.json`
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidCreate(() => this.refresh(), undefined, context.subscriptions);
    watcher.onDidChange(() => this.refresh(), undefined, context.subscriptions);
    watcher.onDidDelete(() => this.refresh(), undefined, context.subscriptions);
    this.fileWatcher = watcher;
    context.subscriptions.push(watcher);

    const compileCommandsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        projectInfo.workspaceRoot,
        `${projectInfo.projectEntryRelativePath}/build_*_hcpu/{,bootloader/}compile_commands.json`
      )
    );
    compileCommandsWatcher.onDidCreate(() => this.refresh(), undefined, context.subscriptions);
    compileCommandsWatcher.onDidChange(() => this.refresh(), undefined, context.subscriptions);
    compileCommandsWatcher.onDidDelete(() => this.refresh(), undefined, context.subscriptions);
    this.compileCommandsWatcher = compileCommandsWatcher;
    context.subscriptions.push(compileCommandsWatcher);
  }
}
