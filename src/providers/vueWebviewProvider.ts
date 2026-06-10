import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { ConfigService } from '../services/configService';
import { GitService } from '../services/gitService';
import { BuildExecutionService } from '../services/buildExecutionService';
import { KconfigService } from '../services/kconfigService';
import { LogService } from '../services/logService';
import { RegionService } from '../services/regionService';
import { SdkService } from '../services/sdkService';
import { TerminalService } from '../services/terminalService';
import { UvService } from '../services/uvService';
import { WindowsManagedEnvService } from '../services/windowsManagedEnvService';
import { MemoryMapService } from '../services/memoryMapService';
import { PtabService } from '../services/ptabService';
import { GIT_REPOS, SDK_INSTALL_IDLE_TIMEOUT_MS } from '../constants';
import {
  KconfigChange,
  SdkTaskKind,
  SdkTaskRecord,
  TaskLogEntry,
  ToolchainMirrorUrls,
  ToolchainSource,
} from '../types';
import { MemoryMapSnapshot } from '../types/memoryMap';
import { PtabChangeRequest, PtabSnapshot } from '../types/ptab';
import { DebugSnapshotRequest } from '../types/debugSnapshot';
import { DebugSnapshotBackend } from '../peripheral-viewer/export/debugSnapshotBackend';
import { getPeripheralViewerDebugSnapshotBackend } from '../peripheral-viewer';
import { formatInstallScriptFailure } from '../utils/powerShellUtils';
import { createIdleTimeoutWatchdog } from '../utils/idleTimeoutWatchdog';
import { getVueWebviewContent } from '../utils/vueWebviewContent';
import { applySdkInstallMirrorEnvironment, normalizeToolchainMirrorUrls } from '../utils/sdkInstallMirrorEnv';

const RELEASE_BRANCH_PREFIX = 'release/';

interface InstallSdkMessageData {
  sdkSource: 'github' | 'gitee';
  targetRef: string;
  targetKind: 'branch' | 'tag';
  directoryName: string;
  installPath: string;
  toolchainSource?: ToolchainSource;
  toolchainMirrorUrls?: ToolchainMirrorUrls;
  toolsPath?: string;
}

interface InstallExistingSdkMessageData {
  sdkPath: string;
  toolchainSource?: ToolchainSource;
  toolchainMirrorUrls?: ToolchainMirrorUrls;
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
  toolchainMirrorUrls?: ToolchainMirrorUrls;
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
type WebviewPanelKind = 'sdkManager' | 'debugSnapshot' | 'menuconfig' | 'memoryMap' | 'ptab';

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
  private readonly buildExecutionService: BuildExecutionService;
  private readonly kconfigService: KconfigService;
  private readonly configService: ConfigService;
  private readonly logService: LogService;
  private readonly memoryMapService: MemoryMapService;
  private readonly ptabService: PtabService;
  private readonly tasks = new Map<string, SdkTaskRecord>();
  private sdkManagerPanel?: vscode.WebviewPanel;
  private debugSnapshotPanel?: vscode.WebviewPanel;
  private menuconfigPanel?: vscode.WebviewPanel;
  private memoryMapPanel?: vscode.WebviewPanel;
  private ptabPanel?: vscode.WebviewPanel;

  private constructor() {
    this.terminalService = TerminalService.getInstance();
    this.sdkService = SdkService.getInstance();
    this.gitService = GitService.getInstance();
    this.buildExecutionService = BuildExecutionService.getInstance();
    this.kconfigService = KconfigService.getInstance();
    this.configService = ConfigService.getInstance();
    this.logService = LogService.getInstance();
    this.memoryMapService = MemoryMapService.getInstance();
    this.ptabService = PtabService.getInstance();
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

  public async openMenuconfigWebview(context: vscode.ExtensionContext): Promise<void> {
    this.openPanel('menuconfig', context);
  }

  public async openMemoryMapWebview(context: vscode.ExtensionContext): Promise<void> {
    this.openPanel('memoryMap', context);
  }

  public async openPtabWebview(context: vscode.ExtensionContext): Promise<void> {
    this.openPanel('ptab', context);
  }

  public refreshMemoryMapPanel(snapshot?: MemoryMapSnapshot): boolean {
    if (!this.memoryMapPanel) {
      return false;
    }

    if (snapshot) {
      this.memoryMapPanel.webview.postMessage({
        command: 'memoryMapSnapshot',
        snapshot,
      });
      return true;
    }

    void this.handleGetMemoryMapSnapshot(this.memoryMapPanel.webview);
    return true;
  }

  public refreshPtabPanel(snapshot?: PtabSnapshot): boolean {
    if (!this.ptabPanel) {
      return false;
    }

    if (snapshot) {
      this.ptabPanel.webview.postMessage({
        command: 'ptabSnapshot',
        snapshot,
      });
      return true;
    }

    void this.handleGetPtabSnapshot(this.ptabPanel.webview);
    return true;
  }

  private openPanel(kind: WebviewPanelKind, context: vscode.ExtensionContext): void {
    const existingPanel = this.getPanel(kind);
    if (existingPanel) {
      existingPanel.reveal(existingPanel.viewColumn ?? vscode.ViewColumn.One);
      const panelConfig = this.getPanelConfig(kind);
      if (panelConfig.initialRoute) {
        existingPanel.webview.postMessage({ command: 'navigate', route: panelConfig.initialRoute });
      }
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
          this.logService.error(`Webview command failed: ${String(message.command)}`, messageText);
          if (this.isPtabCommand(message.command)) {
            this.postPtabError(panel.webview, error);
            return;
          }
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
    if (kind === 'sdkManager') {
      return this.sdkManagerPanel;
    }
    if (kind === 'debugSnapshot') {
      return this.debugSnapshotPanel;
    }
    if (kind === 'memoryMap') {
      return this.memoryMapPanel;
    }
    if (kind === 'ptab') {
      return this.ptabPanel;
    }
    return this.menuconfigPanel;
  }

  private setPanel(kind: WebviewPanelKind, panel: vscode.WebviewPanel): void {
    if (kind === 'sdkManager') {
      this.sdkManagerPanel = panel;
      return;
    }

    if (kind === 'menuconfig') {
      this.menuconfigPanel = panel;
      return;
    }

    if (kind === 'memoryMap') {
      this.memoryMapPanel = panel;
      return;
    }

    if (kind === 'ptab') {
      this.ptabPanel = panel;
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

    if (kind === 'menuconfig') {
      this.menuconfigPanel = undefined;
      return;
    }

    if (kind === 'memoryMap') {
      this.memoryMapPanel = undefined;
      return;
    }

    if (kind === 'ptab') {
      this.ptabPanel = undefined;
      return;
    }

    this.debugSnapshotPanel = undefined;
  }

  private getPanelConfig(kind: WebviewPanelKind): WebviewPanelConfig {
    if (kind === 'debugSnapshot') {
      return {
        viewType: 'sifliDebugSnapshotVue',
        title: vscode.l10n.t('Debug Snapshot Export'),
        initialRoute: '/debug-snapshot',
      };
    }

    if (kind === 'menuconfig') {
      return {
        viewType: 'sifliMenuconfigVue',
        title: 'SiFli Menuconfig',
        initialRoute: '/menuconfig',
      };
    }

    if (kind === 'memoryMap') {
      return {
        viewType: 'sifliMemoryMapVue',
        title: vscode.l10n.t('Memory Map Analysis'),
        initialRoute: '/memory-map',
      };
    }

    if (kind === 'ptab') {
      return {
        viewType: 'sifliPtabVue',
        title: vscode.l10n.t('PTAB v3'),
        initialRoute: '/ptab',
      };
    }

    return {
      viewType: 'sifliSdkManagerVue',
      title: vscode.l10n.t('SiFli SDK Manager'),
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

      case 'getKconfigSnapshot':
        await this.handleGetKconfigSnapshot(webview);
        break;

      case 'previewKconfigChanges':
        await this.handlePreviewKconfigChanges((message.changes ?? []) as KconfigChange[], webview);
        break;

      case 'saveKconfigChanges':
        this.startSaveKconfigChanges((message.changes ?? []) as KconfigChange[], webview);
        break;

      case 'openTerminalMenuconfig':
        await this.handleOpenTerminalMenuconfig(webview);
        break;

      case 'getMemoryMapSnapshot':
        await this.handleGetMemoryMapSnapshot(webview);
        break;

      case 'refreshMemoryMapAnalysis':
        await this.handleRefreshMemoryMapAnalysis(webview);
        break;

      case 'openMemoryMapLocation':
        await this.handleOpenMemoryMapLocation(message.mapPath, message.line);
        break;

      case 'getPtabSnapshot':
        await this.handleGetPtabSnapshot(webview);
        break;

      case 'previewPtabChanges':
        await this.handlePreviewPtabChanges(message.request as PtabChangeRequest, webview);
        break;

      case 'savePtabChanges':
        await this.handleSavePtabChanges(message.request as PtabChangeRequest, webview);
        break;

      case 'openPtabSource':
        await this.handleOpenPtabSource(message.path);
        break;

      case 'openExternalUrl':
        await this.handleOpenExternalUrl(message.url);
        break;

      default:
        this.logService.warn(`Unknown webview command: ${message.command}`);
    }
  }

  private async handleGetMemoryMapSnapshot(webview: vscode.Webview): Promise<void> {
    try {
      const snapshot = await this.memoryMapService.getSnapshot({ refreshIfStale: true });
      webview.postMessage({
        command: 'memoryMapSnapshot',
        snapshot,
      });
    } catch (error) {
      this.postMemoryMapError(webview, error);
    }
  }

  private async handleRefreshMemoryMapAnalysis(webview: vscode.Webview): Promise<void> {
    try {
      const snapshot = await this.memoryMapService.analyzeCurrentMainMap();
      webview.postMessage({
        command: 'memoryMapSnapshot',
        snapshot,
      });
    } catch (error) {
      this.postMemoryMapError(webview, error);
    }
  }

  private async handleOpenMemoryMapLocation(mapPath: string | undefined, line: number | undefined): Promise<void> {
    await this.memoryMapService.openLocation(mapPath, line);
  }

  private postMemoryMapError(webview: vscode.Webview, error: unknown): void {
    webview.postMessage({
      command: 'memoryMapError',
      message: this.getErrorMessage(error),
    });
  }

  private async handleGetPtabSnapshot(webview: vscode.Webview): Promise<void> {
    const startedAt = Date.now();
    this.logService.info('PTAB snapshot requested.');
    try {
      const snapshot = await this.ptabService.getSnapshot();
      webview.postMessage({
        command: 'ptabSnapshot',
        snapshot,
      });
      this.logService.info(`PTAB snapshot completed in ${Date.now() - startedAt}ms.`);
    } catch (error) {
      this.logService.error('PTAB snapshot failed.', this.getErrorMessage(error));
      this.postPtabError(webview, error);
    }
  }

  private async handlePreviewPtabChanges(request: PtabChangeRequest, webview: vscode.Webview): Promise<void> {
    const startedAt = Date.now();
    this.logService.info(
      `PTAB preview requested: target=${request?.targetKind ?? 'unknown'}, changes=${request?.changes?.length ?? 0}.`
    );
    try {
      const snapshot = await this.ptabService.previewChanges(request);
      webview.postMessage({
        command: 'ptabSnapshot',
        snapshot,
      });
      this.logService.info(`PTAB preview completed in ${Date.now() - startedAt}ms.`);
    } catch (error) {
      this.logService.error('PTAB preview failed.', this.getErrorMessage(error));
      this.postPtabError(webview, error);
    }
  }

  private async handleSavePtabChanges(request: PtabChangeRequest, webview: vscode.Webview): Promise<void> {
    const startedAt = Date.now();
    this.logService.info(
      `PTAB save requested: target=${request?.targetKind ?? 'unknown'}, changes=${request?.changes?.length ?? 0}.`
    );
    try {
      const snapshot = await this.ptabService.saveChanges(request);
      webview.postMessage({
        command: 'ptabSnapshot',
        snapshot,
      });
      webview.postMessage({
        command: 'ptabSaved',
        snapshot,
      });
      this.logService.info(`PTAB save completed in ${Date.now() - startedAt}ms.`);
    } catch (error) {
      this.logService.error('PTAB save failed.', this.getErrorMessage(error));
      this.postPtabError(webview, error);
    }
  }

  private async handleOpenPtabSource(filePath: string | undefined): Promise<void> {
    await this.ptabService.openSource(filePath);
  }

  private async handleOpenExternalUrl(url: string | undefined): Promise<void> {
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error(vscode.l10n.t('Invalid external URL.'));
    }
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private postPtabError(webview: vscode.Webview, error: unknown): void {
    webview.postMessage({
      command: 'ptabError',
      message: this.getErrorMessage(error),
    });
  }

  private async handleGetKconfigSnapshot(webview: vscode.Webview): Promise<void> {
    try {
      const snapshot = await this.kconfigService.getSnapshot();
      webview.postMessage({
        command: 'kconfigSnapshot',
        snapshot,
      });
    } catch (error) {
      this.postKconfigError(webview, error);
    }
  }

  private async handlePreviewKconfigChanges(changes: KconfigChange[], webview: vscode.Webview): Promise<void> {
    try {
      const snapshot = await this.kconfigService.previewChanges(changes);
      webview.postMessage({
        command: 'kconfigSnapshot',
        snapshot,
      });
    } catch (error) {
      this.postKconfigError(webview, error);
    }
  }

  private startSaveKconfigChanges(changes: KconfigChange[], webview: vscode.Webview): void {
    const taskId = `kconfig-task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    webview.postMessage({
      command: 'kconfigTaskStarted',
      taskId,
      title: vscode.l10n.t('Save Menuconfig'),
    });
    webview.postMessage({
      command: 'kconfigTaskLog',
      taskId,
      level: 'info',
      message: vscode.l10n.t('Saving proj.conf in the background and refreshing build configuration...'),
    });

    void (async () => {
      try {
        const snapshot = await this.kconfigService.saveChanges(changes);
        webview.postMessage({
          command: 'kconfigTaskLog',
          taskId,
          level: 'info',
          message: vscode.l10n.t('Configuration saved.'),
        });
        webview.postMessage({
          command: 'kconfigSnapshot',
          snapshot,
        });
        webview.postMessage({
          command: 'kconfigTaskFinished',
          taskId,
          success: true,
          snapshot,
        });
      } catch (error) {
        const message = this.getErrorMessage(error);
        webview.postMessage({
          command: 'kconfigTaskLog',
          taskId,
          level: 'error',
          message,
        });
        webview.postMessage({
          command: 'kconfigTaskFinished',
          taskId,
          success: false,
          message,
        });
        this.postKconfigError(webview, error);
      }
    })();
  }

  private async handleOpenTerminalMenuconfig(webview: vscode.Webview): Promise<void> {
    try {
      await this.buildExecutionService.executeMenuconfig({ waitForExit: false });
      webview.postMessage({
        command: 'kconfigTaskLog',
        taskId: 'terminal-menuconfig',
        level: 'info',
        message: vscode.l10n.t('Terminal Menuconfig opened.'),
      });
    } catch (error) {
      this.postKconfigError(webview, error);
    }
  }

  private postKconfigError(webview: vscode.Webview, error: unknown): void {
    webview.postMessage({
      command: 'kconfigError',
      message: this.getErrorMessage(error),
    });
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
      throw new Error(vscode.l10n.t('Failed to fetch version list: HTTP {0}', response.status));
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
        message: vscode.l10n.t('Task does not exist: {0}', taskId),
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
      title: vscode.l10n.t('Select SDK installation directory'),
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
      title: vscode.l10n.t('Select toolchain directory'),
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
    const title = vscode.l10n.t('Install SDK {0}', data.directoryName || data.targetRef);
    const task = this.createTask('install', title);
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      const toolchainSource = data.toolchainSource ?? (await this.getDefaultToolchainSource());
      const toolchainMirrorUrls = this.normalizeMirrorUrlsForSource(toolchainSource, data.toolchainMirrorUrls);
      const toolsPath = data.toolsPath?.trim() || undefined;
      const directoryName = data.directoryName.trim();
      const installContainerPath = data.installPath.trim();

      if (!directoryName) {
        throw new Error(vscode.l10n.t('Directory name cannot be empty.'));
      }

      if (!installContainerPath) {
        throw new Error(vscode.l10n.t('SDK installation directory cannot be empty.'));
      }

      const sdkBasePath = resolveSdkInstallBasePath(installContainerPath);
      const fullInstallPath = path.join(sdkBasePath, directoryName);

      if (fs.existsSync(fullInstallPath)) {
        throw new Error(vscode.l10n.t('Target directory already exists: {0}', fullInstallPath));
      }

      if (!(await this.gitService.isGitInstalled())) {
        throw new Error(vscode.l10n.t('Git is not installed or is not on system PATH.'));
      }

      if (!fs.existsSync(sdkBasePath)) {
        fs.mkdirSync(sdkBasePath, { recursive: true });
      }

      const repoUrl = data.sdkSource === 'github' ? GIT_REPOS.GITHUB.GIT_URL : GIT_REPOS.GITEE.GIT_URL;
      const cloneRef =
        data.targetKind === 'branch' ? normalizeBranchGitRef(data.targetRef) : stripTagRef(data.targetRef);

      log(vscode.l10n.t('Preparing to install SDK: {0}', directoryName));
      log(vscode.l10n.t('Source repository: {0}', repoUrl));
      log(vscode.l10n.t('Installation path: {0}', fullInstallPath));
      log(vscode.l10n.t('Target Ref: {0}', data.targetRef));

      await this.gitService.cloneRepository(repoUrl, fullInstallPath, {
        branch: cloneRef,
        idleTimeoutMs: SDK_INSTALL_IDLE_TIMEOUT_MS,
        onProgress: progress => log(progress),
      });

      await this.runInstallScript(fullInstallPath, toolsPath, toolchainSource, toolchainMirrorUrls, log, true);

      await this.configService.addSdkConfig(fullInstallPath, toolsPath, toolchainSource, toolchainMirrorUrls);

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
    const task = this.createTask(
      'import',
      vscode.l10n.t('Import SDK {0}', path.basename(data.sdkPath) || data.sdkPath),
      data.sdkPath
    );
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      const validation = await this.inspectSdkPath(data.sdkPath);
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const toolchainSource = data.toolchainSource ?? (await this.getDefaultToolchainSource());
      const toolchainMirrorUrls = this.normalizeMirrorUrlsForSource(toolchainSource, data.toolchainMirrorUrls);
      const toolsPath = data.toolsPath?.trim() || undefined;

      log(vscode.l10n.t('Import path: {0}', data.sdkPath));

      const hasInstallScript = !!this.sdkService.getInstallScriptPath(data.sdkPath);
      if (hasInstallScript) {
        await this.runInstallScript(data.sdkPath, toolsPath, toolchainSource, toolchainMirrorUrls, log, true);
      } else {
        log(vscode.l10n.t('No install script detected. Skipping tool installation.'), 'warn');
      }

      await this.configService.addSdkConfig(data.sdkPath, toolsPath, toolchainSource, toolchainMirrorUrls);

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
    const task = this.createTask(
      'switch-ref',
      vscode.l10n.t('Switch SDK Version'),
      this.sdkService.decodeSdkId(data.sdkId)
    );
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      const currentPath = this.sdkService.decodeSdkId(data.sdkId);
      const detail = await this.sdkService.getManagedSdkDetail(data.sdkId);

      if (!detail.isGitRepo) {
        throw new Error(vscode.l10n.t('Current SDK is not a Git repository, so it cannot switch versions.'));
      }

      log(vscode.l10n.t('Current path: {0}', currentPath));
      log(vscode.l10n.t('Target Ref: {0}', data.targetRef));

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
        log(vscode.l10n.t('Directory renamed to: {0}', finalPath));
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
    const task = this.createTask(
      'update-branch',
      vscode.l10n.t('Update SDK Branch {0}', path.basename(sdkPath)),
      sdkPath
    );
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      const detail = await this.sdkService.getManagedSdkDetail(sdkId);
      if (detail.refType !== 'branch') {
        throw new Error(vscode.l10n.t('Current SDK is not on a managed branch, so it cannot be updated.'));
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
    const task = this.createTask('rename-directory', vscode.l10n.t('Rename SDK {0}', path.basename(sdkPath)), sdkPath);
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      const renamed = await this.sdkService.renameSdkDirectory(sdkPath, data.newDirectoryName);
      log(vscode.l10n.t('Directory renamed: {0}', renamed.newPath));

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
    const task = this.createTask('update-tools', vscode.l10n.t('Update Tools {0}', path.basename(sdkPath)), sdkPath);
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      const detail = await this.sdkService.getManagedSdkDetail(sdkId);
      const toolchainSource = detail.toolchainSource ?? (await this.getDefaultToolchainSource());
      const toolchainMirrorUrls = this.normalizeMirrorUrlsForSource(toolchainSource, detail.toolchainMirrorUrls);
      const toolsPath = detail.toolsPath?.trim() || undefined;

      await this.runInstallScript(detail.path, toolsPath, toolchainSource, toolchainMirrorUrls, log, false);
      await this.configService.setSdkToolchainSource(detail.path, toolchainSource, toolchainMirrorUrls);

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
    const title = vscode.l10n.t('Remove SDK {0}', path.basename(sdkPath));
    const task = this.createTask('remove-sdk', title, sdkPath);
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      log(vscode.l10n.t('Preparing to permanently remove SDK from the system: {0}', sdkPath));

      if (fs.existsSync(sdkPath)) {
        log(vscode.l10n.t('Deleting filesystem directory...'));
        fs.rmSync(sdkPath, { recursive: true, force: true });
        log(vscode.l10n.t('Filesystem directory deleted.'));
      } else {
        log(vscode.l10n.t('Target directory does not exist. Skipping file deletion.'));
      }

      log(vscode.l10n.t('Cleaning workspace configuration...'));
      await this.sdkService.removeSdkPath(sdkPath);

      log(vscode.l10n.t('SDK removed successfully.'));
      return {
        path: sdkPath,
      };
    });
  }

  private startEditToolchainTask(data: EditToolchainMessageData, webview: vscode.Webview): void {
    const sdkPath = this.sdkService.decodeSdkId(data.sdkId);
    const task = this.createTask(
      'edit-toolchain',
      vscode.l10n.t('Edit Toolchain Configuration {0}', path.basename(sdkPath)),
      sdkPath
    );
    this.postTaskStarted(task, webview);

    void this.runTask(task, webview, async log => {
      log(vscode.l10n.t("Updating this SDK's toolchain source to: {0}", data.source));
      const toolchainMirrorUrls = this.normalizeMirrorUrlsForSource(data.source, data.toolchainMirrorUrls);
      await this.configService.setSdkToolchainSource(sdkPath, data.source, toolchainMirrorUrls);

      if (data.toolsPath) {
        log(vscode.l10n.t('Updated custom linked tool environment path to: {0}', data.toolsPath));
        await this.sdkService.setSdkToolsPath(sdkPath, data.toolsPath);
      } else {
        log(vscode.l10n.t('Cleared the custom linked tool environment. The system will use the default path.'));
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
        message: vscode.l10n.t('Please enter an SDK path.'),
      };
    }

    if (!fs.existsSync(sdkPath)) {
      return {
        valid: false,
        message: vscode.l10n.t('SDK path does not exist.'),
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
        message: vscode.l10n.t('SDK is missing required directories or export script.'),
        hasInstallScript,
        hasExportScript,
        hasVersionFile,
      };
    }

    return {
      valid: true,
      message: vscode.l10n.t('SDK validation succeeded.'),
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
    toolchainMirrorUrls: ToolchainMirrorUrls | undefined,
    log: TaskLogger,
    failOnMissingScript: boolean
  ): Promise<void> {
    const installScript = this.sdkService.getInstallScriptPath(sdkPath);
    if (!installScript) {
      if (failOnMissingScript) {
        throw new Error(vscode.l10n.t('Install script was not found.'));
      }

      log(vscode.l10n.t('Cannot manually update tools because the install script was not found.'), 'error');
      throw new Error(vscode.l10n.t('Install script was not found.'));
    }

    await this.executeInstallScript(installScript, sdkPath, toolsPath, toolchainSource, toolchainMirrorUrls, log);
  }

  private async executeInstallScript(
    scriptPath: string,
    workingDir: string,
    toolsPath: string | undefined,
    toolchainSource: ToolchainSource,
    toolchainMirrorUrls: ToolchainMirrorUrls | undefined,
    log: TaskLogger
  ): Promise<void> {
    let uvDir: string | undefined;
    let managedWindowsPathEntries: string[] = [];
    const powerShell = process.platform === 'win32' ? this.terminalService.getPowerShellExecutableInfo() : undefined;
    if (process.platform === 'win32') {
      log(vscode.l10n.t('Preparing bundled uv...'));
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

      const mirrorEnv = applySdkInstallMirrorEnvironment(env, toolchainSource, toolchainMirrorUrls);

      log(vscode.l10n.t('Running script: {0} {1}', command, args.join(' ')));
      if (powerShell) {
        log(`PowerShell: ${powerShell.kind} (${powerShell.source})`);
      }
      if (uvDir) {
        log(vscode.l10n.t('Bundled uv: {0}', uvDir));
      }
      if (managedWindowsPathEntries.length > 0) {
        log(`Windows managed PATH: ${managedWindowsPathEntries.join(';')}`);
      }
      if (toolsPath) {
        log(`SIFLI_SDK_TOOLS_PATH=${toolsPath}`);
      }
      if (mirrorEnv.source === 'sifli') {
        log(vscode.l10n.t('Using the SiFli China mirror preset.'));
      } else if (mirrorEnv.source === 'custom') {
        log(vscode.l10n.t('Using custom toolchain mirror URLs.'));
      }
      if (mirrorEnv.keys.length > 0) {
        log(vscode.l10n.t('Mirror environment variables: {0}', mirrorEnv.keys.join(', ')));
      }

      const child = spawn(command, args, {
        cwd: workingDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const idleTimeoutMinutes = Math.floor(SDK_INSTALL_IDLE_TIMEOUT_MS / 60_000);
      const idleTimeoutMessage = vscode.l10n.t(
        'The install script timed out after {0} minutes without new stdout/stderr output.',
        idleTimeoutMinutes
      );
      const idleTimeoutWatchdog = createIdleTimeoutWatchdog(SDK_INSTALL_IDLE_TIMEOUT_MS, () => {
        if (!child.killed) {
          child.kill('SIGTERM');
        }

        finish(() => reject(new Error(idleTimeoutMessage)));
      });

      const finish = (handler: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        idleTimeoutWatchdog.dispose();
        handler();
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        const output = chunk.toString();
        idleTimeoutWatchdog.bump();
        stdout += output;
        output
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean)
          .forEach(line => log(line));
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const output = chunk.toString();
        idleTimeoutWatchdog.bump();
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

  private isPtabCommand(command: unknown): boolean {
    return (
      typeof command === 'string' &&
      (command === 'getPtabSnapshot' ||
        command === 'previewPtabChanges' ||
        command === 'savePtabChanges' ||
        command === 'openPtabSource')
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

  private normalizeMirrorUrlsForSource(
    toolchainSource: ToolchainSource,
    toolchainMirrorUrls?: ToolchainMirrorUrls
  ): ToolchainMirrorUrls | undefined {
    return toolchainSource === 'custom' ? normalizeToolchainMirrorUrls(toolchainMirrorUrls) : undefined;
  }

  private getVSCodeLocale(): string {
    const config = vscode.workspace.getConfiguration();
    const locale = config.get<string>('locale') || vscode.env.language || 'en';
    return locale.startsWith('zh') ? 'zh' : 'en';
  }

  private getWebviewContent(webview: vscode.Webview, extensionPath: string): string {
    return getVueWebviewContent(webview, extensionPath);
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
