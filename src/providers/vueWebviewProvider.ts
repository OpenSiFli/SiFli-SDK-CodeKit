import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { ConfigService } from '../services/configService';
import { GitService } from '../services/gitService';
import { LogService } from '../services/logService';
import { RegionService } from '../services/regionService';
import { SdkService } from '../services/sdkService';
import { TerminalService } from '../services/terminalService';
import { UvService } from '../services/uvService';
import { WindowsManagedEnvService } from '../services/windowsManagedEnvService';
import { GIT_REPOS } from '../constants';
import { SdkTaskKind, SdkTaskRecord, TaskLogEntry, ToolchainSource } from '../types';
import { DebugSnapshotRequest } from '../types/debugSnapshot';
import { DebugSnapshotBackend } from '../peripheral-viewer/export/debugSnapshotBackend';
import { getPeripheralViewerDebugSnapshotBackend } from '../peripheral-viewer';
import { formatInstallScriptFailure } from '../utils/powerShellUtils';

const RELEASE_BRANCH_PREFIX = 'release/';

interface InstallSdkMessageData {
  sdkSource: 'github' | 'gitee';
  targetRef: string;
  targetKind: 'branch' | 'tag';
  directoryName: string;
  installPath: string;
  toolchainSource?: ToolchainSource;
  toolsPath?: string;
}

interface InstallExistingSdkMessageData {
  sdkPath: string;
  toolchainSource?: ToolchainSource;
  toolsPath?: string;
}

interface SwitchSdkRefMessageData {
  sdkId: string;
  targetRef: string;
  targetKind: 'branch' | 'tag';
  newDirectoryName?: string;
}

interface RenameSdkDirectoryMessageData {
  sdkId: string;
  newDirectoryName: string;
}

interface RemoveSdkMessageData {
  sdkId: string;
}

interface EditToolchainMessageData {
  sdkId: string;
  source: ToolchainSource;
  toolsPath: string;
}

interface ExistingSdkValidationResult {
  valid: boolean;
  message: string;
  name?: string;
  isGitRepo?: boolean;
  ref?: string;
  hash?: string;
  hasInstallScript?: boolean;
  hasExportScript?: boolean;
  hasVersionFile?: boolean;
}

type TaskLogger = (message: string, level?: TaskLogEntry['level']) => void;
type WebviewPanelKind = 'sdkManager' | 'debugSnapshot';

interface WebviewPanelConfig {
  viewType: string;
  title: string;
  initialRoute?: string;
}

function normalizeBranchGitRef(branchRef: string): string {
  if (branchRef === 'latest' || branchRef === 'main') {
    return 'main';
  }

  return branchRef.startsWith(RELEASE_BRANCH_PREFIX) ? branchRef : `${RELEASE_BRANCH_PREFIX}${branchRef}`;
}

function stripTagRef(tagRef: string): string {
  return tagRef.startsWith('refs/tags/') ? tagRef.slice('refs/tags/'.length) : tagRef;
}

function resolveSdkInstallBasePath(installPath: string): string {
  const normalizedInstallPath = path.normalize(installPath.trim());
  return path.basename(normalizedInstallPath) === 'SiFli-SDK'
    ? normalizedInstallPath
    : path.join(normalizedInstallPath, 'SiFli-SDK');
}

export class VueWebviewProvider {
  private static instance: VueWebviewProvider;
  private readonly terminalService: TerminalService;
  private readonly sdkService: SdkService;
  private readonly gitService: GitService;
  private readonly configService: ConfigService;
  private readonly logService: LogService;
  private readonly tasks = new Map<string, SdkTaskRecord>();
  private sdkManagerPanel?: vscode.WebviewPanel;
  private debugSnapshotPanel?: vscode.WebviewPanel;

  private constructor() {
    this.terminalService = TerminalService.getInstance();
    this.sdkService = SdkService.getInstance();
    this.gitService = GitService.getInstance();
    this.configService = ConfigService.getInstance();
    this.logService = LogService.getInstance();
  }

  public static getInstance(): VueWebviewProvider {
    if (!VueWebviewProvider.instance) {
      VueWebviewProvider.instance = new VueWebviewProvider();
    }
    return VueWebviewProvider.instance;
  }

  public async createSdkManagementWebview(context: vscode.ExtensionContext): Promise<void> {
    this.openPanel('sdkManager', context);
  }

  public async openDebugSnapshotWebview(context: vscode.ExtensionContext): Promise<void> {
    this.openPanel('debugSnapshot', context);
  }

  private openPanel(kind: WebviewPanelKind, context: vscode.ExtensionContext): void {
    const existingPanel = this.getPanel(kind);
    if (existingPanel) {
      existingPanel.reveal(existingPanel.viewColumn ?? vscode.ViewColumn.One);
      return;
    }

    const panelConfig = this.getPanelConfig(kind);
    const panel = vscode.window.createWebviewPanel(panelConfig.viewType, panelConfig.title, vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      enableCommandUris: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, 'webview-vue', 'dist')),
        vscode.Uri.file(path.join(context.extensionPath, 'webview-vue', 'dist', 'assets')),
      ],
    });

    panel.webview.html = this.getWebviewContent(panel.webview, context.extensionPath);

    panel.webview.onDidReceiveMessage(
      async message => {
        if (message.command === 'ready') {
          panel.webview.postMessage({
            command: 'initializeLocale',
            locale: this.getVSCodeLocale(),
          });

          await this.sendRegionDefaults(panel.webview);

          if (panelConfig.initialRoute) {
            panel.webview.postMessage({ command: 'navigate', route: panelConfig.initialRoute });
          }
          return;
        }

        try {
          await this.handleWebviewMessage(message, panel.webview);
        } catch (error) {
          const messageText = error instanceof Error ? error.message : String(error);
          panel.webview.postMessage({
            command: 'error',
            message: messageText,
          });
        }
      },
      undefined,
      context.subscriptions
    );

    const configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('locale')) {
        panel.webview.postMessage({
          command: 'localeChanged',
          locale: this.getVSCodeLocale(),
        });
      }
    });

    panel.onDidDispose(() => {
      configChangeListener.dispose();
      this.clearPanel(kind, panel);
    });

    this.setPanel(kind, panel);
  }

  private getPanel(kind: WebviewPanelKind): vscode.WebviewPanel | undefined {
    return kind === 'sdkManager' ? this.sdkManagerPanel : this.debugSnapshotPanel;
  }

  private setPanel(kind: WebviewPanelKind, panel: vscode.WebviewPanel): void {
    if (kind === 'sdkManager') {
      this.sdkManagerPanel = panel;
      return;
    }

    this.debugSnapshotPanel = panel;
  }

  private clearPanel(kind: WebviewPanelKind, panel: vscode.WebviewPanel): void {
    if (this.getPanel(kind) !== panel) {
      return;
    }

    if (kind === 'sdkManager') {
      this.sdkManagerPanel = undefined;
      return;
    }

    this.debugSnapshotPanel = undefined;
  }

  private getPanelConfig(kind: WebviewPanelKind): WebviewPanelConfig {
    if (kind === 'debugSnapshot') {
      return {
        viewType: 'sifliDebugSnapshotVue',
        title: '调试现场导出',
        initialRoute: '/debug-snapshot',
      };
    }

    return {
      viewType: 'sifliSdkManagerVue',
      title: 'SiFli SDK 管理器',
    };
  }

  private async handleWebviewMessage(message: any, webview: vscode.Webview): Promise<void> {
    switch (message.command) {
      case 'getSdkList':
        await this.sendSdkList(webview);
        break;

      case 'getSdkDetail':
        if (!message.sdkId) {
          throw new Error('Missing sdkId.');
        }
        await this.sendSdkDetail(message.sdkId, webview);
        break;

      case 'getSdkTargets':
        await this.sendSdkTargets(webview);
        break;

      case 'getTaskStatus':
        if (!message.taskId) {
          throw new Error('Missing taskId.');
        }
        this.sendTaskSnapshot(message.taskId, webview);
        break;

      case 'activateSdk':
        if (!message.sdkId) {
          throw new Error('Missing sdkId.');
        }
        await this.activateSdk(message.sdkId, webview);
        break;

      case 'browseInstallPath':
        await this.browseInstallPath(webview);
        break;

      case 'browseToolsPath':
        await this.browseToolsPath(webview);
        break;

      case 'validateExistingSdk':
        await this.validateExistingSdk(message.path, webview);
        break;

      case 'installSdk':
        this.startInstallSdkTask(message.data as InstallSdkMessageData, webview);
        break;

      case 'installExistingSdk':
        this.startInstallExistingSdkTask(message.data as InstallExistingSdkMessageData, webview);
        break;

      case 'switchSdkRef':
        this.startSwitchSdkRefTask(message.data as SwitchSdkRefMessageData, webview);
        break;

      case 'updateBranchSdk':
        if (!message.sdkId) {
          throw new Error('Missing sdkId.');
        }
        this.startUpdateBranchTask(message.sdkId, webview);
        break;

      case 'renameSdkDirectory':
        this.startRenameSdkDirectoryTask(message.data as RenameSdkDirectoryMessageData, webview);
        break;

      case 'rerunInstallScript':
        if (!message.sdkId) {
          throw new Error('Missing sdkId.');
        }
        this.startRerunInstallScriptTask(message.sdkId, webview);
        break;

      case 'removeSdk':
        this.startRemoveSdkTask(message.data as RemoveSdkMessageData, webview);
        break;

      case 'editToolchain':
        this.startEditToolchainTask(message.data as EditToolchainMessageData, webview);
        break;

      case 'openInExplorer':
        this.openInExplorer(message.path);
        break;

      case 'openInTerminal':
        this.openInTerminal(message.path);
        break;

      case 'closeManager':
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        break;

      case 'getDebugSnapshotBootstrap':
        await this.handleDebugSnapshotBootstrap(webview);
        break;

      case 'buildDebugSnapshotPlan':
        await this.handleBuildDebugSnapshotPlan(message.partNumber, webview);
        break;

      case 'browseDebugSnapshotOutputRoot':
        await this.handleBrowseDebugSnapshotOutputRoot(webview);
        break;

      case 'startDebugSnapshotExport':
        await this.handleStartDebugSnapshotExport(message.request as DebugSnapshotRequest, webview);
        break;

      case 'getDebugSnapshotTask':
        this.handleGetDebugSnapshotTask(message.taskId, webview);
        break;

      case 'cancelDebugSnapshotTask':
        await this.handleCancelDebugSnapshotTask(message.taskId, webview);
        break;

      default:
        this.logService.warn(`Unknown webview command: ${message.command}`);
    }
  }

  private async sendSdkList(webview: vscode.Webview): Promise<void> {
    const sdks = await this.sdkService.getManagedSdks();
    const currentSdk = sdks.find(item => item.isCurrent);

    webview.postMessage({
      command: 'updateSdkList',
      sdks,
      currentSdkId: currentSdk?.id ?? null,
    });
  }

  private async sendSdkDetail(sdkId: string, webview: vscode.Webview): Promise<void> {
    const sdk = await this.sdkService.getManagedSdkDetail(sdkId);
    webview.postMessage({
      command: 'sdkDetail',
      sdk,
    });
  }

  private async sendSdkTargets(webview: vscode.Webview): Promise<void> {
    const response = await fetch('https://downloads.sifli.com/dl/sifli-sdk/version.json');
    if (!response.ok) {
      throw new Error(`获取版本列表失败: HTTP ${response.status}`);
    }

    const rawTargets = (await response.json()) as Array<{
      version: string;
      supported_chips: string[];
      type?: 'branch';
    }>;

    webview.postMessage({
      command: 'sdkTargets',
      targets: this.sdkService.normalizeSdkTargets(rawTargets),
    });
  }

  private sendTaskSnapshot(taskId: string, webview: vscode.Webview): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      webview.postMessage({
        command: 'error',
        message: `任务不存在: ${taskId}`,
      });
      return;
    }

    webview.postMessage({
      command: 'taskSnapshot',
      task,
    });
  }

  private async activateSdk(sdkId: string, webview: vscode.Webview): Promise<void> {
    const sdk = await this.sdkService.getManagedSdkDetail(sdkId);
    await this.sdkService.activateSdk(sdk);

    webview.postMessage({
      command: 'sdkActivated',
      sdkId,
    });

    await this.sendSdkList(webview);
    await this.sendSdkDetail(sdkId, webview);
  }

  private async browseInstallPath(webview: vscode.Webview): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: '选择 SDK 安装目录',
    });

    if (result && result.length > 0) {
      webview.postMessage({
        command: 'installPathSelected',
        path: result[0].fsPath,
      });
    }
  }

  private async browseToolsPath(webview: vscode.Webview): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: '选择工具链目录',
    });

    if (result && result.length > 0) {
      webview.postMessage({
        command: 'toolsPathSelected',
        path: result[0].fsPath,
      });
    }
  }

  private async validateExistingSdk(sdkPath: string, webview: vscode.Webview): Promise<void> {
    const summary = await this.inspectSdkPath(sdkPath);
    webview.postMessage({
      command: 'sdkValidationResult',
      ...summary,
    });
  }

  private startInstallSdkTask(data: InstallSdkMessageData, webview: vscode.Webview): void {
    const title = `安装 SDK ${data.directoryName || data.targetRef}`;
    const task = this.createTask('install', title);
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      const toolchainSource = data.toolchainSource ?? (await this.getDefaultToolchainSource());
      const toolsPath = data.toolsPath?.trim() || undefined;
      const directoryName = data.directoryName.trim();
      const installContainerPath = data.installPath.trim();

      if (!directoryName) {
        throw new Error('目录名称不能为空。');
      }

      if (!installContainerPath) {
        throw new Error('SDK 安装目录不能为空。');
      }

      const sdkBasePath = resolveSdkInstallBasePath(installContainerPath);
      const fullInstallPath = path.join(sdkBasePath, directoryName);

      if (fs.existsSync(fullInstallPath)) {
        throw new Error(`目标目录已存在: ${fullInstallPath}`);
      }

      if (!(await this.gitService.isGitInstalled())) {
        throw new Error('Git 未安装或不在系统 PATH 中。');
      }

      if (!fs.existsSync(sdkBasePath)) {
        fs.mkdirSync(sdkBasePath, { recursive: true });
      }

      const repoUrl = data.sdkSource === 'github' ? GIT_REPOS.GITHUB.GIT_URL : GIT_REPOS.GITEE.GIT_URL;
      const cloneRef =
        data.targetKind === 'branch' ? normalizeBranchGitRef(data.targetRef) : stripTagRef(data.targetRef);

      log(`准备安装 SDK: ${directoryName}`);
      log(`源码仓库: ${repoUrl}`);
      log(`安装路径: ${fullInstallPath}`);
      log(`目标 Ref: ${data.targetRef}`);

      await this.gitService.cloneRepository(repoUrl, fullInstallPath, {
        branch: cloneRef,
        onProgress: progress => log(progress),
      });

      await this.runInstallScript(fullInstallPath, toolsPath, toolchainSource, log, true);

      await this.configService.addSdkConfig(fullInstallPath, toolsPath, toolchainSource);

      const metadata = await this.gitService.getSdkMetadata(fullInstallPath);
      return {
        sdkId: this.sdkService.encodeSdkId(fullInstallPath),
        path: fullInstallPath,
        ref: metadata.ref,
        hash: metadata.hash,
      };
    });
  }

  private startInstallExistingSdkTask(data: InstallExistingSdkMessageData, webview: vscode.Webview): void {
    const task = this.createTask('import', `导入 SDK ${path.basename(data.sdkPath) || data.sdkPath}`, data.sdkPath);
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      const validation = await this.inspectSdkPath(data.sdkPath);
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const toolchainSource = data.toolchainSource ?? (await this.getDefaultToolchainSource());
      const toolsPath = data.toolsPath?.trim() || undefined;

      log(`导入路径: ${data.sdkPath}`);

      const hasInstallScript = !!this.sdkService.getInstallScriptPath(data.sdkPath);
      if (hasInstallScript) {
        await this.runInstallScript(data.sdkPath, toolsPath, toolchainSource, log, true);
      } else {
        log('未检测到 install 脚本，跳过工具安装步骤。', 'warn');
      }

      await this.configService.addSdkConfig(data.sdkPath, toolsPath, toolchainSource);

      const metadata = await this.gitService.getSdkMetadata(data.sdkPath);
      return {
        sdkId: this.sdkService.encodeSdkId(data.sdkPath),
        path: data.sdkPath,
        ref: metadata.ref,
        hash: metadata.hash,
      };
    });
  }

  private startSwitchSdkRefTask(data: SwitchSdkRefMessageData, webview: vscode.Webview): void {
    const task = this.createTask('switch-ref', `切换 SDK 版本`, this.sdkService.decodeSdkId(data.sdkId));
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      const currentPath = this.sdkService.decodeSdkId(data.sdkId);
      const detail = await this.sdkService.getManagedSdkDetail(data.sdkId);

      if (!detail.isGitRepo) {
        throw new Error('当前 SDK 不是 Git 仓库，无法切换版本。');
      }

      log(`当前路径: ${currentPath}`);
      log(`目标 Ref: ${data.targetRef}`);

      if (data.targetKind === 'branch') {
        await this.gitService.switchToBranchRef(currentPath, normalizeBranchGitRef(data.targetRef), log);
      } else {
        await this.gitService.switchToTagRef(currentPath, stripTagRef(data.targetRef), log);
      }

      let finalPath = currentPath;
      if (
        data.newDirectoryName &&
        data.newDirectoryName.trim() &&
        path.basename(currentPath) !== data.newDirectoryName.trim()
      ) {
        const renamed = await this.sdkService.renameSdkDirectory(currentPath, data.newDirectoryName.trim());
        finalPath = renamed.newPath;
        log(`目录已重命名为: ${finalPath}`);
      }

      const metadata = await this.gitService.getSdkMetadata(finalPath);
      return {
        sdkId: this.sdkService.encodeSdkId(finalPath),
        path: finalPath,
        ref: metadata.ref,
        hash: metadata.hash,
      };
    });
  }

  private startUpdateBranchTask(sdkId: string, webview: vscode.Webview): void {
    const sdkPath = this.sdkService.decodeSdkId(sdkId);
    const task = this.createTask('update-branch', `更新 SDK 分支 ${path.basename(sdkPath)}`, sdkPath);
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      const detail = await this.sdkService.getManagedSdkDetail(sdkId);
      if (detail.refType !== 'branch') {
        throw new Error('当前 SDK 不在受管分支上，无法更新。');
      }

      await this.gitService.updateBranchToLatest(sdkPath, detail.ref, log);

      const metadata = await this.gitService.getSdkMetadata(sdkPath);
      return {
        sdkId,
        path: sdkPath,
        ref: metadata.ref,
        hash: metadata.hash,
      };
    });
  }

  private startRenameSdkDirectoryTask(data: RenameSdkDirectoryMessageData, webview: vscode.Webview): void {
    const sdkPath = this.sdkService.decodeSdkId(data.sdkId);
    const task = this.createTask('rename-directory', `重命名 SDK ${path.basename(sdkPath)}`, sdkPath);
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      const renamed = await this.sdkService.renameSdkDirectory(sdkPath, data.newDirectoryName);
      log(`目录已重命名: ${renamed.newPath}`);

      const metadata = await this.gitService.getSdkMetadata(renamed.newPath);
      return {
        sdkId: this.sdkService.encodeSdkId(renamed.newPath),
        path: renamed.newPath,
        ref: metadata.ref,
        hash: metadata.hash,
      };
    });
  }

  private startRerunInstallScriptTask(sdkId: string, webview: vscode.Webview): void {
    const sdkPath = this.sdkService.decodeSdkId(sdkId);
    const task = this.createTask('update-tools', `更新工具 ${path.basename(sdkPath)}`, sdkPath);
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      const detail = await this.sdkService.getManagedSdkDetail(sdkId);
      const toolchainSource = detail.toolchainSource ?? (await this.getDefaultToolchainSource());
      const toolsPath = detail.toolsPath?.trim() || undefined;

      await this.runInstallScript(detail.path, toolsPath, toolchainSource, log, false);
      await this.configService.setSdkToolchainSource(detail.path, toolchainSource);

      const metadata = await this.gitService.getSdkMetadata(detail.path);
      return {
        sdkId,
        path: detail.path,
        ref: metadata.ref,
        hash: metadata.hash,
      };
    });
  }

  private startRemoveSdkTask(data: RemoveSdkMessageData, webview: vscode.Webview): void {
    const sdkPath = this.sdkService.decodeSdkId(data.sdkId);
    const title = `移除 SDK ${path.basename(sdkPath)}`;
    const task = this.createTask('remove-sdk', title, sdkPath);
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      log(`准备从系统中彻底移除 SDK: ${sdkPath}`);

      if (fs.existsSync(sdkPath)) {
        log(`正在删除文件系统目录...`);
        fs.rmSync(sdkPath, { recursive: true, force: true });
        log(`文件系统目录删除完毕.`);
      } else {
        log(`目标目录不存在，跳过文件删除.`);
      }

      log(`清理工作区配置...`);
      await this.sdkService.removeSdkPath(sdkPath);

      log(`SDK 成功移除.`);
      return {
        path: sdkPath,
      };
    });
  }

  private startEditToolchainTask(data: EditToolchainMessageData, webview: vscode.Webview): void {
    const sdkPath = this.sdkService.decodeSdkId(data.sdkId);
    const task = this.createTask('edit-toolchain', `修改工具链配置 ${path.basename(sdkPath)}`, sdkPath);
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      log(`正在更新此 SDK 的工具链源为: ${data.source}`);
      await this.configService.setSdkToolchainSource(sdkPath, data.source);

      if (data.toolsPath) {
        log(`更新自定义关联工具环境路径为: ${data.toolsPath}`);
        await this.sdkService.setSdkToolsPath(sdkPath, data.toolsPath);
      } else {
        log(`清除了自定义关联工具环境，系统将使用默认路径.`);
        await this.configService.removeSdkToolsPath(sdkPath);
      }

      const metadata = await this.gitService.getSdkMetadata(sdkPath);
      return {
        sdkId: data.sdkId,
        path: sdkPath,
        ref: metadata.ref,
        hash: metadata.hash,
      };
    });
  }

  private async runTask(
    task: SdkTaskRecord,
    webview: vscode.Webview,
    executor: (log: TaskLogger) => Promise<SdkTaskRecord['result']>
  ): Promise<void> {
    try {
      const result = await executor((message, level = 'info') => this.appendTaskLog(task.id, webview, message, level));
      this.finishTask(task.id, webview, 'succeeded', result);
      await this.sendSdkList(webview);

      if (result?.sdkId) {
        await this.sendSdkDetail(result.sdkId, webview);
      }
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.appendTaskLog(task.id, webview, errorMessage, 'error');
      this.finishTask(task.id, webview, 'failed', undefined, errorMessage);
      await this.sendSdkList(webview);
    }
  }

  private createTask(kind: SdkTaskKind, title: string, sdkPath?: string): SdkTaskRecord {
    const now = new Date().toISOString();
    const task: SdkTaskRecord = {
      id: `sdk-task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      kind,
      title,
      sdkPath,
      sdkId: sdkPath ? this.sdkService.encodeSdkId(sdkPath) : undefined,
      status: 'running',
      startedAt: now,
      logs: [],
    };

    this.tasks.set(task.id, task);
    return task;
  }

  private postTaskStarted(task: SdkTaskRecord, webview: vscode.Webview): void {
    webview.postMessage({
      command: 'taskStarted',
      taskId: task.id,
      task,
    });
  }

  private appendTaskLog(
    taskId: string,
    webview: vscode.Webview,
    message: string,
    level: TaskLogEntry['level'] = 'info'
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    const entry: TaskLogEntry = {
      ts: new Date().toISOString(),
      level,
      message,
    };
    task.logs.push(entry);

    webview.postMessage({
      command: 'taskLog',
      taskId,
      entry,
    });
  }

  private finishTask(
    taskId: string,
    webview: vscode.Webview,
    status: SdkTaskRecord['status'],
    result?: SdkTaskRecord['result'],
    error?: string
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.status = status;
    task.finishedAt = new Date().toISOString();
    task.result = result;
    task.error = error;

    webview.postMessage({
      command: 'taskFinished',
      taskId,
      task,
    });
  }

  private async inspectSdkPath(sdkPath: string): Promise<ExistingSdkValidationResult> {
    if (!sdkPath || !sdkPath.trim()) {
      return {
        valid: false,
        message: '请输入 SDK 路径。',
      };
    }

    if (!fs.existsSync(sdkPath)) {
      return {
        valid: false,
        message: 'SDK 路径不存在。',
      };
    }

    const hasCustomer = fs.existsSync(path.join(sdkPath, 'customer'));
    const hasExportScript = !!this.sdkService.getExportScriptPath(sdkPath);
    const hasInstallScript = !!this.sdkService.getInstallScriptPath(sdkPath);
    const hasVersionFile = fs.existsSync(path.join(sdkPath, 'version.txt'));
    const metadata = await this.gitService.getSdkMetadata(sdkPath);

    if (!hasCustomer || !hasExportScript) {
      return {
        valid: false,
        message: 'SDK 缺少必要目录或导出脚本。',
        hasInstallScript,
        hasExportScript,
        hasVersionFile,
      };
    }

    return {
      valid: true,
      message: 'SDK 验证成功。',
      name: path.basename(sdkPath),
      isGitRepo: metadata.isGitRepo,
      ref: metadata.ref,
      hash: metadata.hash,
      hasInstallScript,
      hasExportScript,
      hasVersionFile,
    };
  }

  private async runInstallScript(
    sdkPath: string,
    toolsPath: string | undefined,
    toolchainSource: ToolchainSource,
    log: TaskLogger,
    failOnMissingScript: boolean
  ): Promise<void> {
    const installScript = this.sdkService.getInstallScriptPath(sdkPath);
    if (!installScript) {
      if (failOnMissingScript) {
        throw new Error('未找到 install 脚本。');
      }

      log('未找到 install 脚本，无法手动更新工具。', 'error');
      throw new Error('未找到 install 脚本。');
    }

    await this.executeInstallScript(installScript, sdkPath, toolsPath, toolchainSource, log);
  }

  private async executeInstallScript(
    scriptPath: string,
    workingDir: string,
    toolsPath: string | undefined,
    toolchainSource: ToolchainSource,
    log: TaskLogger
  ): Promise<void> {
    let uvDir: string | undefined;
    let managedWindowsPathEntries: string[] = [];
    const powerShell = process.platform === 'win32' ? this.terminalService.getPowerShellExecutableInfo() : undefined;
    if (process.platform === 'win32') {
      log('正在准备内置 uv...');
      await UvService.getInstance().ensureUvAvailable();
      uvDir = UvService.getInstance().getManagedExecutableDir();
      if (!uvDir) {
        throw new Error(vscode.l10n.t('Failed to locate uv executable after extraction.'));
      }
    }

    await new Promise<void>((resolve, reject) => {
      let command: string;
      let args: string[];

      if (process.platform === 'win32') {
        command = powerShell?.executablePath ?? this.terminalService.getPowerShellExecutablePath();
        args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath];
      } else {
        command = 'bash';
        args = [scriptPath];
      }

      const env = { ...process.env };

      if (process.platform === 'win32') {
        managedWindowsPathEntries = WindowsManagedEnvService.getInstance().applyInstallScriptEnvironment(env);
      }

      if (toolsPath) {
        env.SIFLI_SDK_TOOLS_PATH = toolsPath;
      }

      if (toolchainSource === 'sifli') {
        env.SIFLI_SDK_GITHUB_ASSETS = 'downloads.sifli.com/github_assets';
        env.PIP_INDEX_URL = 'https://mirrors.ustc.edu.cn/pypi/simple';
      }

      log(`执行脚本: ${command} ${args.join(' ')}`);
      if (powerShell) {
        log(`PowerShell: ${powerShell.kind} (${powerShell.source})`);
      }
      if (uvDir) {
        log(`内置 uv: ${uvDir}`);
      }
      if (managedWindowsPathEntries.length > 0) {
        log(`Windows managed PATH: ${managedWindowsPathEntries.join(';')}`);
      }
      if (toolsPath) {
        log(`SIFLI_SDK_TOOLS_PATH=${toolsPath}`);
      }
      if (toolchainSource === 'sifli') {
        log('使用 SiFli 工具链镜像源。');
      }

      const child = spawn(command, args, {
        cwd: workingDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = (handler: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        handler();
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        const output = chunk.toString();
        stdout += output;
        output
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean)
          .forEach(line => log(line));
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const output = chunk.toString();
        stderr += output;
        output
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean)
          .forEach(line => log(line, 'warn'));
      });

      child.on('close', code => {
        finish(() => {
          if (code === 0) {
            resolve();
            return;
          }

          const message = stderr.trim() || stdout.trim() || `install script exited with code ${code}`;
          reject(new Error(this.formatInstallScriptError(message, powerShell?.kind)));
        });
      });

      child.on('error', error => {
        finish(() => reject(new Error(this.formatInstallScriptError(this.getErrorMessage(error), powerShell?.kind))));
      });

      const timeout = setTimeout(
        () => {
          if (!child.killed) {
            child.kill('SIGTERM');
          }

          finish(() => reject(new Error('install 脚本执行超时。')));
        },
        10 * 60 * 1000
      );
    });
  }

  private openInExplorer(targetPath: string | undefined): void {
    if (!targetPath || !fs.existsSync(targetPath)) {
      vscode.window.showErrorMessage(vscode.l10n.t('Target path does not exist.'));
      return;
    }

    void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(targetPath));
  }

  private openInTerminal(targetPath: string | undefined): void {
    if (!targetPath || !fs.existsSync(targetPath)) {
      vscode.window.showErrorMessage(vscode.l10n.t('Target path does not exist.'));
      return;
    }

    const terminalOptions: vscode.TerminalOptions = {
      name: vscode.l10n.t('SiFli SDK'),
      cwd: targetPath,
    };
    if (process.platform === 'win32') {
      terminalOptions.shellPath = this.terminalService.getPowerShellExecutablePath();
    }
    const terminal = vscode.window.createTerminal(terminalOptions);
    terminal.show();
  }

  private formatInstallScriptError(message: string, powerShellKind: 'pwsh' | 'powershell' | undefined): string {
    return formatInstallScriptFailure(
      message,
      powerShellKind,
      vscode.l10n.t('install.ps1 failed under Windows PowerShell. Please update to PowerShell 7 and try again.')
    );
  }

  private async sendRegionDefaults(webview: vscode.Webview): Promise<void> {
    const regionService = RegionService.getInstance();
    const inChina = await regionService.isUserInChina();

    webview.postMessage({
      command: 'setDefaultSources',
      sdkSource: inChina ? 'gitee' : 'github',
      toolchainSource: inChina ? 'sifli' : 'github',
    });
  }

  private async getDefaultToolchainSource(): Promise<ToolchainSource> {
    const regionService = RegionService.getInstance();
    return (await regionService.isUserInChina()) ? 'sifli' : 'github';
  }

  private getVSCodeLocale(): string {
    const config = vscode.workspace.getConfiguration();
    const locale = config.get<string>('locale') || vscode.env.language || 'en';
    return locale.startsWith('zh') ? 'zh' : 'en';
  }

  private getWebviewContent(webview: vscode.Webview, extensionPath: string): string {
    const vueDistPath = path.join(extensionPath, 'webview-vue', 'dist');
    const templatePath = path.join(extensionPath, 'src', 'providers', 'templates', 'webview.html');

    const getResourceUri = (relativePath: string) => {
      const fullPath = path.join(vueDistPath, relativePath);
      if (!fs.existsSync(fullPath)) {
        return null;
      }

      return webview.asWebviewUri(vscode.Uri.file(fullPath)).toString();
    };

    const jsUri = getResourceUri('assets/index.js');
    const cssFiles = fs.existsSync(path.join(vueDistPath, 'assets'))
      ? fs.readdirSync(path.join(vueDistPath, 'assets')).filter(file => file.endsWith('.css'))
      : [];
    const cssUris = cssFiles.map(file => getResourceUri(`assets/${file}`)).filter(Boolean);

    if (!jsUri) {
      return this.getErrorWebviewContent('Vue 应用脚本文件未找到，请运行 yarn build:webview');
    }

    if (!fs.existsSync(templatePath)) {
      return this.getErrorWebviewContent('Webview 模板文件未找到');
    }

    let html = fs.readFileSync(templatePath, 'utf8');
    const cssLinks = cssUris.map(uri => `<link rel="stylesheet" href="${uri}">`).join('\n  ');
    html = html.replace('{{VUE_SCRIPT_URI}}', jsUri);
    html = html.replace('</head>', `  ${cssLinks}\n</head>`);
    return html;
  }

  private getErrorWebviewContent(message: string): string {
    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>错误</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            text-align: center;
          }
          .error {
            color: var(--vscode-errorForeground);
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <h1>加载失败</h1>
        <div class="error">${message}</div>
        <p>请检查 webview-vue 项目是否已正确构建。</p>
      </body>
      </html>
    `;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  // --- Debug Snapshot handlers ---

  private getDebugSnapshotBackend(): DebugSnapshotBackend | undefined {
    return getPeripheralViewerDebugSnapshotBackend();
  }

  private async handleDebugSnapshotBootstrap(webview: vscode.Webview): Promise<void> {
    const backend = this.getDebugSnapshotBackend();
    if (!backend) {
      webview.postMessage({
        command: 'debugSnapshotBootstrap',
        bootstrap: {
          session: { executionState: 'unknown', canExport: false },
          chipOptions: [],
          warnings: ['Debug snapshot backend is not available. Please start a debug session first.'],
        },
      });
      return;
    }

    const bootstrap = await backend.getDebugSnapshotBootstrap();
    webview.postMessage({ command: 'debugSnapshotBootstrap', bootstrap });
  }

  private async handleBuildDebugSnapshotPlan(partNumber: string, webview: vscode.Webview): Promise<void> {
    const backend = this.getDebugSnapshotBackend();
    if (!backend) {
      throw new Error('Debug snapshot backend is not available.');
    }

    const plan = await backend.buildDebugSnapshotPlan(partNumber);
    webview.postMessage({ command: 'debugSnapshotPlan', plan });
  }

  private async handleBrowseDebugSnapshotOutputRoot(webview: vscode.Webview): Promise<void> {
    const backend = this.getDebugSnapshotBackend();
    if (!backend) {
      throw new Error('Debug snapshot backend is not available.');
    }

    const selection = await backend.browseDebugSnapshotOutputRoot();
    webview.postMessage({ command: 'debugSnapshotOutputRootSelected', selection });
  }

  private async handleStartDebugSnapshotExport(request: DebugSnapshotRequest, webview: vscode.Webview): Promise<void> {
    const backend = this.getDebugSnapshotBackend();
    if (!backend) {
      throw new Error('Debug snapshot backend is not available.');
    }

    const eventDisposable = backend.onDidEmitEvent(event => {
      webview.postMessage(event);
    });

    try {
      const task = await backend.startDebugSnapshotExport(request);
      webview.postMessage({ command: 'debugSnapshotTaskStarted', task });

      // Clean up the event listener after the task completes
      void backend.waitForTaskCompletion(task.taskId).finally(() => {
        eventDisposable.dispose();
      });
    } catch (error) {
      eventDisposable.dispose();
      throw error;
    }
  }

  private handleGetDebugSnapshotTask(taskId: string, webview: vscode.Webview): void {
    const backend = this.getDebugSnapshotBackend();
    const task = backend?.getDebugSnapshotTask(taskId);
    webview.postMessage({ command: 'debugSnapshotTaskSnapshot', task });
  }

  private async handleCancelDebugSnapshotTask(taskId: string, webview: vscode.Webview): Promise<void> {
    const backend = this.getDebugSnapshotBackend();
    const task = await backend?.cancelDebugSnapshotTask(taskId);
    webview.postMessage({ command: 'debugSnapshotTaskSnapshot', task });
  }
}
