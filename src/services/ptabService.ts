import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { spawn } from 'child_process';
import { Board } from '../types';
import { PtabChangeRequest, PtabEditTarget, PtabPartition, PtabSnapshot } from '../types/ptab';
import { buildExportedEnvironmentPythonSnippet, parseExportedEnvironmentFile } from '../utils/exportedEnvironmentUtils';
import { getBoardSearchPath } from '../utils/boardSearchPathUtils';
import { getProjectInfo, SiFliProjectInfo } from '../utils/projectUtils';
import {
  buildPartitionPatchFromDraft,
  getBaseBoardName,
  getProjectBoardOverlayPath,
  getProjectBoardPtabPath,
  getProjectChipOverlayPath,
  isSupportedPtabSdkBranch,
  normalizePtabBoardName,
  upsertPartitionItems,
} from '../utils/ptabUtils';
import {
  buildPowerShellDotSourceCommandWithOutputToError,
  quotePowerShellString,
  resolvePowerShellExecutable,
} from '../utils/powerShellUtils';
import { BoardService } from './boardService';
import { ConfigService } from './configService';
import { GitService } from './gitService';
import { LogService } from './logService';
import { SdkService } from './sdkService';
import { WindowsManagedEnvService } from './windowsManagedEnvService';

interface PtabBridgeMetadata {
  workspace_root: string;
  project_dir: string;
  sdk_root: string;
  board: string;
  normalized_board: string;
  chip: string;
  chip_dir: string;
  board_path?: string | null;
  source_mode: 'board' | 'project_full' | 'overlay';
  uses_overlay: boolean;
  base_path?: string | null;
  effective_path?: string | null;
  project_full_ptab?: string | null;
  project_yaml_ptab?: string | null;
  overlay_paths?: {
    chip?: string | null;
    board?: string | null;
  };
}

interface PtabBridgePayload {
  schema_version: number;
  metadata: PtabBridgeMetadata;
  effective_data?: Record<string, unknown> | null;
  regions: PtabSnapshot['regions'];
  usage_entries: PtabSnapshot['usageEntries'];
  gaps: PtabSnapshot['gaps'];
  overlaps: PtabSnapshot['overlaps'];
  partitions: PtabPartition[];
  validation: PtabSnapshot['validation'];
  overlay_operations: PtabSnapshot['overlayOperations'];
}

interface PtabContext {
  projectInfo: SiFliProjectInfo;
  sdkPath: string;
  sdkRef: string;
  sdkHash: string;
  boardName: string;
  normalizedBoardName: string;
  board?: Board;
  boardSearchPath?: string;
}

interface ExportedShellEnvironment {
  sdkPath: string;
  exportScriptPath: string;
  env: NodeJS.ProcessEnv;
}

interface CandidateBuildResult {
  args: string[];
  cleanup: () => void;
  writeToTarget: () => Promise<void>;
}

const PTAB_OVERLAY_FILE = 'ptab.overlay.yaml';
const PTAB_YAML_FILE = 'ptab.yaml';

export class PtabService {
  private static instance: PtabService;

  private readonly configService: ConfigService;
  private readonly boardService: BoardService;
  private readonly sdkService: SdkService;
  private readonly gitService: GitService;
  private readonly logService: LogService;
  private exportedEnvironment?: ExportedShellEnvironment;
  private context?: vscode.ExtensionContext;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.boardService = BoardService.getInstance();
    this.sdkService = SdkService.getInstance();
    this.gitService = GitService.getInstance();
    this.logService = LogService.getInstance();
  }

  public static getInstance(): PtabService {
    if (!PtabService.instance) {
      PtabService.instance = new PtabService();
    }
    return PtabService.instance;
  }

  public setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  public async getSnapshot(): Promise<PtabSnapshot> {
    const context = await this.resolveContext();
    const payload = await this.runBridge(context, []);
    return this.toSnapshot(payload, context);
  }

  public async previewChanges(request: PtabChangeRequest): Promise<PtabSnapshot> {
    const context = await this.resolveContext();
    const currentPayload = await this.runBridge(context, []);
    const candidate = await this.buildCandidate(context, currentPayload, request);
    try {
      const payload = await this.runBridge(context, candidate.args);
      return this.toSnapshot(payload, context);
    } finally {
      candidate.cleanup();
    }
  }

  public async saveChanges(request: PtabChangeRequest): Promise<PtabSnapshot> {
    const context = await this.resolveContext();
    const currentPayload = await this.runBridge(context, []);
    const candidate = await this.buildCandidate(context, currentPayload, request);
    try {
      const payload = await this.runBridge(context, candidate.args);
      const blocking = (payload.validation ?? []).filter(issue => issue.severity === 'error');
      if (blocking.length > 0) {
        throw new Error(blocking.map(issue => issue.message).join(os.EOL));
      }
      await candidate.writeToTarget();
    } finally {
      candidate.cleanup();
    }

    return this.getSnapshot();
  }

  public async openSource(filePath: string | undefined): Promise<void> {
    if (!filePath) {
      throw new Error(vscode.l10n.t('No PTAB source path is available.'));
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(document, { preserveFocus: false });
  }

  private async resolveContext(): Promise<PtabContext> {
    const projectInfo = getProjectInfo();
    if (!projectInfo) {
      throw new Error(vscode.l10n.t('Open a SiFli project before using PTAB visualization.'));
    }

    const sdkPath = this.configService.getCurrentSdkPath() || this.configService.getCurrentSdk()?.path || '';
    if (!sdkPath || !fs.existsSync(sdkPath)) {
      throw new Error(vscode.l10n.t('Select or activate a SiFli SDK before using PTAB visualization.'));
    }

    const metadata = await this.gitService.getSdkMetadata(sdkPath);
    if (metadata.refType !== 'branch' || !isSupportedPtabSdkBranch(metadata.ref)) {
      throw new Error(
        vscode.l10n.t(
          'PTAB v3 visualization only supports SDK branches main and release/v2.5. Current SDK ref: {0}',
          metadata.ref
        )
      );
    }

    const boardName = this.configService.getSelectedBoardName();
    if (!boardName || boardName === 'N/A') {
      throw new Error(vscode.l10n.t('Select a SiFli board before using PTAB visualization.'));
    }

    const normalizedBoardName = normalizePtabBoardName(boardName);
    const board = await this.resolveBoard(boardName);
    const boardSearchPath = board ? this.resolveBoardSearchPath(board, projectInfo) : undefined;

    return {
      projectInfo,
      sdkPath,
      sdkRef: metadata.ref,
      sdkHash: metadata.hash,
      boardName,
      normalizedBoardName,
      board,
      boardSearchPath,
    };
  }

  private async resolveBoard(boardName: string): Promise<Board | undefined> {
    const baseName = getBaseBoardName(boardName);
    const normalized = normalizePtabBoardName(boardName);
    const boards = await this.boardService.discoverBoards();
    return boards.find(
      board => board.name === boardName || board.name === baseName || normalizePtabBoardName(board.name) === normalized
    );
  }

  private resolveBoardSearchPath(board: Board, projectInfo: SiFliProjectInfo): string | undefined {
    if (board.type === 'sdk') {
      return undefined;
    }
    const searchPath = getBoardSearchPath(board, projectInfo.projectEntryPath, projectInfo.workspaceRoot);
    if (!searchPath) {
      return undefined;
    }
    return path.isAbsolute(searchPath) ? searchPath : path.resolve(projectInfo.projectEntryPath, searchPath);
  }

  private getBridgeScriptPath(): string {
    if (!this.context) {
      throw new Error(vscode.l10n.t('Extension context is not initialized.'));
    }
    const scriptPath = path.join(this.context.extensionPath, 'scripts', 'ptab_bridge.py');
    if (!fs.existsSync(scriptPath)) {
      throw new Error(vscode.l10n.t('PTAB bridge script was not found: {0}', scriptPath));
    }
    return scriptPath;
  }

  private runBridge(context: PtabContext, extraArgs: string[]): Promise<PtabBridgePayload> {
    const args = [
      this.getBridgeScriptPath(),
      'snapshot',
      '--sdk',
      context.sdkPath,
      '--project',
      context.projectInfo.projectEntryPath,
      '--workspace',
      context.projectInfo.workspaceRoot,
      '--board',
      context.boardName,
      ...extraArgs,
    ];
    if (context.boardSearchPath) {
      args.push('--board-search-path', context.boardSearchPath);
    }

    const bridgeLabel = extraArgs.length > 0 ? extraArgs.filter(arg => arg.startsWith('--')).join(', ') : 'current';
    const startedAt = Date.now();
    this.logService.info(`Running PTAB bridge snapshot: ${bridgeLabel}.`);

    return new Promise((resolve, reject) => {
      void (async () => {
        let child: ReturnType<typeof spawn> | undefined;
        try {
          const exportedEnv = await this.ensureExportedEnvironment(context);
          const env = {
            ...exportedEnv,
            ...this.buildBridgeEnvironment(context, exportedEnv),
          };
          child = spawn(this.getExportedPythonPath(exportedEnv), args, {
            cwd: context.projectInfo.projectEntryPath,
            env,
            windowsHide: true,
          });

          let stdout = '';
          let stderr = '';
          const timeout = setTimeout(() => {
            try {
              child?.kill();
            } catch {
              // Ignore kill failures.
            }
            this.logService.error(`PTAB bridge timed out after ${Date.now() - startedAt}ms: ${bridgeLabel}.`);
            reject(new Error(vscode.l10n.t('PTAB operation timed out.')));
          }, 60_000);

          child.stdout?.on('data', chunk => {
            stdout += chunk.toString();
          });
          child.stderr?.on('data', chunk => {
            stderr += chunk.toString();
          });
          child.on('error', error => {
            clearTimeout(timeout);
            this.logService.error(`PTAB bridge failed before exit: ${error.message}`);
            reject(error);
          });
          child.on('close', code => {
            clearTimeout(timeout);
            if (code !== 0) {
              this.logService.error(
                `PTAB bridge exited with code ${String(code)} after ${Date.now() - startedAt}ms.`,
                stderr.trim() || stdout.trim()
              );
              reject(new Error(stderr.trim() || stdout.trim() || `PTAB bridge exited with code ${String(code)}`));
              return;
            }
            try {
              const payload = JSON.parse(stdout) as PtabBridgePayload;
              this.logService.info(`PTAB bridge snapshot completed in ${Date.now() - startedAt}ms: ${bridgeLabel}.`);
              resolve(payload);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              this.logService.error(`PTAB bridge output parse failed after ${Date.now() - startedAt}ms.`, message);
              reject(new Error(`Failed to parse PTAB bridge output: ${message}${stderr ? `${os.EOL}${stderr}` : ''}`));
            }
          });
        } catch (error) {
          reject(error);
        }
      })();
    });
  }

  private async buildCandidate(
    context: PtabContext,
    payload: PtabBridgePayload,
    request: PtabChangeRequest
  ): Promise<CandidateBuildResult> {
    if (!request.changes || request.changes.length === 0) {
      throw new Error(vscode.l10n.t('No PTAB changes to save.'));
    }

    const target = this.getEditTargets(context, payload).find(item => item.kind === request.targetKind);
    if (!target) {
      throw new Error(vscode.l10n.t('Unsupported PTAB edit target: {0}', request.targetKind));
    }
    if (!target.editable) {
      throw new Error(target.reason || vscode.l10n.t('The selected PTAB target is read-only.'));
    }

    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codekit-ptab-'));
    const cleanup = () => {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures.
      }
    };

    const patches = request.changes.map(change =>
      buildPartitionPatchFromDraft(change, request.targetKind, this.findOriginalPartition(payload, change.originalName))
    );

    if (request.targetKind === 'project_overlay' || request.targetKind === 'project_chip_overlay') {
      const overlayData = this.readYamlMappingIfExists(target.path);
      overlayData.partitions = upsertPartitionItems(overlayData.partitions, patches, true);
      const candidatePath = path.join(tempRoot, PTAB_OVERLAY_FILE);
      await this.writeYaml(candidatePath, { partitions: overlayData.partitions });
      const flag =
        request.targetKind === 'project_chip_overlay' ? '--candidate-chip-overlay' : '--candidate-board-overlay';
      return {
        args: [flag, candidatePath],
        cleanup,
        writeToTarget: () => this.writeYaml(target.path, { partitions: overlayData.partitions }),
      };
    }

    if (request.targetKind === 'project_full') {
      if (this.hasAnyOverlay(payload) && !fs.existsSync(target.path)) {
        throw new Error(
          vscode.l10n.t(
            'Cannot create a full project PTAB while project overlays exist. Remove overlays or edit overlay instead.'
          )
        );
      }
      const fullData = fs.existsSync(target.path)
        ? this.readYamlMappingIfExists(target.path)
        : this.buildEffectiveYamlForFullPtab(payload);
      fullData.partitions = upsertPartitionItems(fullData.partitions, patches, false);
      const candidatePath = path.join(tempRoot, PTAB_YAML_FILE);
      await this.writeYaml(candidatePath, fullData);
      return {
        args: ['--candidate-full-ptab', candidatePath],
        cleanup,
        writeToTarget: () => this.writeYaml(target.path, fullData),
      };
    }

    cleanup();
    throw new Error(vscode.l10n.t('Unsupported PTAB edit target: {0}', request.targetKind));
  }

  private toSnapshot(payload: PtabBridgePayload, context: PtabContext): PtabSnapshot {
    const metadata = payload.metadata;
    return {
      schemaVersion: 1,
      sdk: {
        path: context.sdkPath,
        ref: context.sdkRef,
        hash: context.sdkHash,
      },
      workspaceRoot: context.projectInfo.workspaceRoot,
      projectPath: context.projectInfo.projectEntryPath,
      boardName: context.boardName,
      normalizedBoardName: metadata.normalized_board || context.normalizedBoardName,
      boardSource: context.board?.type ?? 'unknown',
      chip: metadata.chip,
      chipDir: metadata.chip_dir,
      sourceMode: metadata.source_mode,
      usesOverlay: metadata.uses_overlay,
      paths: {
        basePath: metadata.base_path,
        effectivePath: metadata.effective_path,
        boardPath: metadata.board_path,
        projectFullPtab: metadata.project_full_ptab,
        projectYamlPtab: metadata.project_yaml_ptab,
        overlayPaths: metadata.overlay_paths ?? {},
      },
      editTargets: this.getEditTargets(context, payload),
      regions: payload.regions ?? [],
      partitions: payload.partitions ?? [],
      usageEntries: payload.usage_entries ?? [],
      gaps: payload.gaps ?? [],
      overlaps: payload.overlaps ?? [],
      validation: payload.validation ?? [],
      overlayOperations: payload.overlay_operations ?? [],
    };
  }

  private getEditTargets(context: PtabContext, payload: PtabBridgePayload): PtabEditTarget[] {
    const metadata = payload.metadata;
    const overlayPaths = metadata.overlay_paths ?? {};
    const boardOverlayPath =
      overlayPaths.board ||
      getProjectBoardOverlayPath(context.projectInfo.projectEntryPath, context.normalizedBoardName);
    const chipOverlayPath =
      overlayPaths.chip || getProjectChipOverlayPath(context.projectInfo.projectEntryPath, metadata.chip_dir);
    const projectFullPath =
      metadata.project_yaml_ptab ||
      getProjectBoardPtabPath(context.projectInfo.projectEntryPath, context.normalizedBoardName);
    const hasProjectFull = !!metadata.project_full_ptab;
    const hasOverlay = this.hasAnyOverlay(payload);

    const targets: PtabEditTarget[] = [
      {
        kind: 'project_overlay',
        label: vscode.l10n.t('Project board overlay'),
        path: boardOverlayPath,
        editable: !hasProjectFull,
        exists: fs.existsSync(boardOverlayPath),
        recommended: !hasProjectFull,
        reason: hasProjectFull ? vscode.l10n.t('Project full PTAB and overlay cannot be used together.') : undefined,
      },
      {
        kind: 'project_full',
        label: vscode.l10n.t('Project full PTAB'),
        path: projectFullPath,
        editable: !hasOverlay || fs.existsSync(projectFullPath),
        exists: fs.existsSync(projectFullPath),
        recommended: false,
        reason:
          hasOverlay && !fs.existsSync(projectFullPath)
            ? vscode.l10n.t(
                'Project overlays already exist. Edit overlay or remove overlays before creating a full PTAB.'
              )
            : undefined,
      },
    ];

    if (overlayPaths.chip || fs.existsSync(chipOverlayPath)) {
      targets.splice(1, 0, {
        kind: 'project_chip_overlay',
        label: vscode.l10n.t('Project chip overlay'),
        path: chipOverlayPath,
        editable: !hasProjectFull,
        exists: fs.existsSync(chipOverlayPath),
        recommended: false,
        reason: hasProjectFull ? vscode.l10n.t('Project full PTAB and overlay cannot be used together.') : undefined,
      });
    }

    return targets;
  }

  private hasAnyOverlay(payload: PtabBridgePayload): boolean {
    const overlays = payload.metadata.overlay_paths ?? {};
    return !!overlays.board || !!overlays.chip;
  }

  private buildEffectiveYamlForFullPtab(payload: PtabBridgePayload): Record<string, unknown> {
    const source =
      payload.effective_data && typeof payload.effective_data === 'object'
        ? { ...payload.effective_data }
        : this.readYamlMappingIfExists(payload.metadata.base_path || undefined);
    source.version = 3;
    if (payload.metadata.chip) {
      source.chip = payload.metadata.chip;
    }
    source.partitions = (payload.partitions ?? []).map(partition => this.stripPartitionMetadata(partition));
    return source;
  }

  private stripPartitionMetadata(partition: PtabPartition): Record<string, unknown> {
    const {
      offset_bytes,
      offset_hex,
      end_offset,
      end_offset_hex,
      size_bytes,
      size_hex,
      source,
      overlayFields,
      overlayOperation,
      ...rest
    } = partition;
    void offset_bytes;
    void offset_hex;
    void end_offset;
    void end_offset_hex;
    void size_bytes;
    void size_hex;
    void source;
    void overlayFields;
    void overlayOperation;
    return { ...rest };
  }

  private findOriginalPartition(
    payload: PtabBridgePayload,
    originalName: string | undefined
  ): PtabPartition | undefined {
    if (!originalName) {
      return undefined;
    }
    const normalized = originalName.trim().toLowerCase();
    return (payload.partitions ?? []).find(partition => partition.name.trim().toLowerCase() === normalized);
  }

  private readYamlMappingIfExists(filePath: string | undefined): Record<string, unknown> {
    if (!filePath || !fs.existsSync(filePath)) {
      return {};
    }
    const data = yaml.load(fs.readFileSync(filePath, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {};
    }
    return data as Record<string, unknown>;
  }

  private async writeYaml(filePath: string, data: Record<string, unknown>): Promise<void> {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const content = yaml.dump(data, {
      sortKeys: false,
      lineWidth: 120,
      noRefs: true,
    });
    await fs.promises.writeFile(filePath, content, 'utf8');
  }

  private async ensureExportedEnvironment(context: PtabContext): Promise<NodeJS.ProcessEnv> {
    const exportScriptPath = this.sdkService.getExportScriptPath(context.sdkPath);
    if (!exportScriptPath || !fs.existsSync(exportScriptPath)) {
      throw new Error(vscode.l10n.t('SDK export script was not found for: {0}', context.sdkPath));
    }

    if (
      this.exportedEnvironment &&
      this.exportedEnvironment.sdkPath === context.sdkPath &&
      this.exportedEnvironment.exportScriptPath === exportScriptPath
    ) {
      return this.exportedEnvironment.env;
    }

    const env = await this.exportSdkEnvironment(context, exportScriptPath);
    this.exportedEnvironment = {
      sdkPath: context.sdkPath,
      exportScriptPath,
      env,
    };
    return env;
  }

  private exportSdkEnvironment(context: PtabContext, exportScriptPath: string): Promise<NodeJS.ProcessEnv> {
    this.logService.info(`Exporting SiFli SDK environment for PTAB bridge: ${exportScriptPath}`);

    const env = {
      ...process.env,
      SIFLI_SDK: context.sdkPath,
      SIFLI_SDK_PATH: context.sdkPath,
      PYTHONIOENCODING: 'utf-8',
    };

    if (process.platform === 'win32') {
      WindowsManagedEnvService.getInstance().applyInstallScriptEnvironment(env);
    }

    return new Promise((resolve, reject) => {
      const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codekit-ptab-sdk-env-'));
      const outputPath = path.join(outputDir, 'environment.json');
      let settled = false;
      const cleanup = () => {
        try {
          fs.rmSync(outputDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup failures.
        }
      };
      const fail = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      };
      const succeed = (exportedEnv: NodeJS.ProcessEnv) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(exportedEnv);
      };
      const shellInvocation = this.buildExportShellInvocation(exportScriptPath, outputPath);
      const child = spawn(shellInvocation.command, shellInvocation.args, {
        cwd: context.projectInfo.projectEntryPath,
        env,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // Ignore kill failures.
        }
        fail(new Error(vscode.l10n.t('PTAB operation timed out.')));
      }, 120_000);

      child.stdout?.on('data', chunk => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', chunk => {
        stderr += chunk.toString();
      });
      child.on('error', error => {
        clearTimeout(timeout);
        fail(error);
      });
      child.on('close', code => {
        clearTimeout(timeout);
        if (settled) {
          return;
        }
        if (code !== 0) {
          fail(new Error(stderr.trim() || stdout.trim() || `SDK export exited with code ${String(code)}`));
          return;
        }
        try {
          succeed(parseExportedEnvironmentFile(outputPath));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const shellOutput = [stderr.trim(), stdout.trim()].filter(Boolean).join(os.EOL);
          fail(
            new Error(
              `Failed to parse exported SDK environment: ${message}${shellOutput ? `${os.EOL}${shellOutput}` : ''}`
            )
          );
        }
      });
    });
  }

  private buildExportShellInvocation(
    exportScriptPath: string,
    exportedEnvironmentPath: string
  ): { command: string; args: string[] } {
    const pythonSnippet = buildExportedEnvironmentPythonSnippet(exportedEnvironmentPath);

    if (process.platform === 'win32') {
      const powerShell = resolvePowerShellExecutable(this.configService.config.powershellPath).executablePath;
      const envJsonCommand = `python -c ${quotePowerShellString(pythonSnippet)}`;
      const command = [
        '$ErrorActionPreference = "Stop"',
        buildPowerShellDotSourceCommandWithOutputToError(exportScriptPath),
        envJsonCommand,
        'exit $LASTEXITCODE',
      ].join('; ');
      return {
        command: powerShell,
        args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      };
    }

    const shellPath = process.env.SHELL || '/bin/zsh';
    const shellName = path.basename(shellPath);
    const args = shellName === 'bash' || shellName === 'zsh' ? ['-l', '-c'] : ['-c'];
    const envJsonCommand = `python -c ${this.shellQuote(pythonSnippet)}`;
    const command = ['set -e', `. ${this.shellQuote(exportScriptPath)} 1>&2`, envJsonCommand].join('; ');
    return {
      command: shellPath,
      args: [...args, command],
    };
  }

  private buildBridgeEnvironment(context: PtabContext, exportedEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const pythonPathEntries = [
      path.join(context.sdkPath, 'tools'),
      path.join(context.sdkPath, 'tools', 'build'),
      exportedEnv.PYTHONPATH,
    ].filter((item): item is string => !!item);
    return {
      ...exportedEnv,
      SIFLI_SDK: context.sdkPath,
      SIFLI_SDK_PATH: context.sdkPath,
      PYTHONIOENCODING: 'utf-8',
      PYTHONPATH: pythonPathEntries.join(path.delimiter),
    };
  }

  private getExportedPythonPath(exportedEnv: NodeJS.ProcessEnv): string {
    const pythonPath = exportedEnv.CODEKIT_EXPORTED_PYTHON;
    if (!pythonPath || !pythonPath.trim()) {
      throw new Error(vscode.l10n.t('SDK export did not provide a Python interpreter path.'));
    }
    return pythonPath;
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }
}
