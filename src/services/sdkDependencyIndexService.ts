import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CODEBASE_INDEX_JSON_FILE } from '../constants';
import { isFile, readJsonFile } from '../utils/fileUtils';
import { getProjectInfo } from '../utils/projectUtils';
import { BoardService } from './boardService';
import { ConfigService } from './configService';
import { LogService } from './logService';

export type SdkDependencyFileKind = 'source' | 'header';

export type SdkDependencySnapshotStatus =
  | 'not-project'
  | 'board-not-selected'
  | 'sdk-not-selected'
  | 'sdk-invalid'
  | 'index-missing'
  | 'index-invalid'
  | 'empty'
  | 'ready';

export interface CodebaseIndexProject {
  name: string;
  full_name: string;
  parent?: string;
  bsp_root?: string;
  build_dir?: string;
  files?: string[];
  sources?: string[];
  headers?: string[];
  include_paths?: string[];
  defines?: string[];
}

export interface CodebaseIndexManifest {
  format_version: number;
  main_project?: string;
  projects: CodebaseIndexProject[];
}

export interface SdkDependencyResolution {
  status: 'resolved' | 'unresolved';
  resolvedPath?: string;
  relativePath?: string;
  reason?: string;
}

export interface SdkDependencyEntry {
  projectFullName: string;
  kind: SdkDependencyFileKind;
  label: string;
  originalPath: string;
  resolution: SdkDependencyResolution;
}

export interface SdkDependencyProjectEntries {
  name: string;
  fullName: string;
  sources: SdkDependencyEntry[];
  headers: SdkDependencyEntry[];
}

export interface SdkDependencySnapshot {
  status: SdkDependencySnapshotStatus;
  message: string;
  boardName?: string;
  currentSdkPath?: string;
  workspaceRoot?: string;
  indexPath?: string;
  manifestMtimeMs?: number;
  shouldAutoGenerate?: boolean;
  autoGenerateKey?: string;
  projects: SdkDependencyProjectEntries[];
}

const PROJECT_ORDER = ['main', 'main.bootloader', 'main.ftab'];

export class SdkDependencyIndexService {
  private static instance: SdkDependencyIndexService;

  private readonly boardService: BoardService;
  private readonly configService: ConfigService;
  private readonly logService: LogService;
  private cachedKey?: string;
  private cachedSnapshot?: SdkDependencySnapshot;

  private constructor() {
    this.boardService = BoardService.getInstance();
    this.configService = ConfigService.getInstance();
    this.logService = LogService.getInstance();
  }

  public static getInstance(): SdkDependencyIndexService {
    if (!SdkDependencyIndexService.instance) {
      SdkDependencyIndexService.instance = new SdkDependencyIndexService();
    }
    return SdkDependencyIndexService.instance;
  }

  public invalidateCache(): void {
    this.cachedKey = undefined;
    this.cachedSnapshot = undefined;
  }

  public async getSnapshot(): Promise<SdkDependencySnapshot> {
    const projectInfo = getProjectInfo();
    if (!projectInfo) {
      return this.cacheAndReturn('not-project', {
        status: 'not-project',
        message: vscode.l10n.t('Open a SiFli project to inspect SDK dependencies.'),
        projects: [],
      });
    }

    const boardName = this.configService.getSelectedBoardName();
    if (!boardName || boardName === 'N/A') {
      return this.cacheAndReturn(`board-not-selected:${projectInfo.workspaceRoot}`, {
        status: 'board-not-selected',
        message: vscode.l10n.t('Select a SiFli board first to inspect SDK dependencies.'),
        workspaceRoot: projectInfo.workspaceRoot,
        projects: [],
      });
    }

    const currentSdkPath = this.configService.getCurrentSdkPath();
    if (!currentSdkPath) {
      return this.cacheAndReturn(`sdk-not-selected:${projectInfo.workspaceRoot}:${boardName}`, {
        status: 'sdk-not-selected',
        message: vscode.l10n.t('Switch to a SiFli SDK first to inspect SDK dependencies.'),
        boardName,
        workspaceRoot: projectInfo.workspaceRoot,
        projects: [],
      });
    }

    if (!fs.existsSync(currentSdkPath) || !fs.statSync(currentSdkPath).isDirectory()) {
      return this.cacheAndReturn(`sdk-invalid:${projectInfo.workspaceRoot}:${boardName}:${currentSdkPath}`, {
        status: 'sdk-invalid',
        message: vscode.l10n.t('Selected SDK path is invalid: {0}', currentSdkPath),
        boardName,
        currentSdkPath,
        workspaceRoot: projectInfo.workspaceRoot,
        projects: [],
      });
    }

    const indexPath = path.join(
      projectInfo.workspaceRoot,
      this.boardService.getBuildTargetFolder(boardName),
      CODEBASE_INDEX_JSON_FILE
    );
    if (!fs.existsSync(indexPath)) {
      return this.cacheAndReturn(`index-missing:${projectInfo.workspaceRoot}:${boardName}:${currentSdkPath}`, {
        status: 'index-missing',
        message: vscode.l10n.t('codebase_index.json not found. Generate it first.'),
        boardName,
        currentSdkPath,
        workspaceRoot: projectInfo.workspaceRoot,
        indexPath,
        shouldAutoGenerate: true,
        autoGenerateKey: `missing:${projectInfo.workspaceRoot}:${boardName}`,
        projects: [],
      });
    }

    const manifestMtimeMs = fs.statSync(indexPath).mtimeMs;
    const buildFolderPath = path.join(projectInfo.workspaceRoot, this.boardService.getBuildTargetFolder(boardName));
    const freshnessMarkerMtimeMs = this.getFreshnessMarkerMtime(buildFolderPath);
    const isStale = freshnessMarkerMtimeMs !== undefined && freshnessMarkerMtimeMs > manifestMtimeMs;
    const cacheKey = `ready:${projectInfo.workspaceRoot}:${boardName}:${currentSdkPath}:${manifestMtimeMs}:${freshnessMarkerMtimeMs ?? 'none'}`;
    if (this.cachedKey === cacheKey && this.cachedSnapshot) {
      return this.cachedSnapshot;
    }

    const manifest = readJsonFile<CodebaseIndexManifest>(indexPath);
    if (!manifest || !Array.isArray(manifest.projects)) {
      const snapshot: SdkDependencySnapshot = {
        status: 'index-invalid',
        message: vscode.l10n.t('Failed to parse codebase_index.json.'),
        boardName,
        currentSdkPath,
        workspaceRoot: projectInfo.workspaceRoot,
        indexPath,
        manifestMtimeMs,
        shouldAutoGenerate: true,
        autoGenerateKey: `invalid:${projectInfo.workspaceRoot}:${boardName}:${manifestMtimeMs}`,
        projects: [],
      };
      return this.cacheSnapshot(cacheKey, snapshot);
    }

    try {
      const projects = manifest.projects
        .map(project => this.resolveProjectEntries(project, projectInfo.workspaceRoot, currentSdkPath))
        .filter((project): project is SdkDependencyProjectEntries => project !== null)
        .filter(project => project.sources.length > 0 || project.headers.length > 0)
        .sort((left, right) => this.compareProjectNames(left.fullName, right.fullName));

      if (projects.length === 0) {
        const snapshot: SdkDependencySnapshot = {
          status: 'empty',
          message: vscode.l10n.t('No SDK dependency files were found in codebase_index.json.'),
          boardName,
          currentSdkPath,
          workspaceRoot: projectInfo.workspaceRoot,
          indexPath,
          manifestMtimeMs,
          projects: [],
        };
        return this.cacheSnapshot(cacheKey, snapshot);
      }

      const snapshot: SdkDependencySnapshot = {
        status: 'ready',
        message: vscode.l10n.t('SDK dependency data loaded from {0}.', indexPath),
        boardName,
        currentSdkPath,
        workspaceRoot: projectInfo.workspaceRoot,
        indexPath,
        manifestMtimeMs,
        shouldAutoGenerate: isStale,
        autoGenerateKey: isStale
          ? `stale:${projectInfo.workspaceRoot}:${boardName}:${manifestMtimeMs}:${freshnessMarkerMtimeMs}`
          : undefined,
        projects,
      };
      return this.cacheSnapshot(cacheKey, snapshot);
    } catch (error) {
      this.logService.error(`Failed to resolve SDK dependencies from ${indexPath}:`, error);
      const snapshot: SdkDependencySnapshot = {
        status: 'index-invalid',
        message: vscode.l10n.t('Failed to read codebase_index.json: {0}', String(error)),
        boardName,
        currentSdkPath,
        workspaceRoot: projectInfo.workspaceRoot,
        indexPath,
        manifestMtimeMs,
        shouldAutoGenerate: true,
        autoGenerateKey: `read-error:${projectInfo.workspaceRoot}:${boardName}:${manifestMtimeMs}`,
        projects: [],
      };
      return this.cacheSnapshot(cacheKey, snapshot);
    }
  }

  private resolveProjectEntries(
    project: CodebaseIndexProject,
    workspaceRoot: string,
    currentSdkPath: string
  ): SdkDependencyProjectEntries | null {
    if (!project.full_name) {
      return null;
    }

    const sources = this.resolveEntries(
      project.full_name,
      'source',
      project.sources ?? [],
      workspaceRoot,
      currentSdkPath
    );
    const headers = this.resolveEntries(
      project.full_name,
      'header',
      project.headers ?? [],
      workspaceRoot,
      currentSdkPath
    );

    return {
      name: project.name || project.full_name,
      fullName: project.full_name,
      sources,
      headers,
    };
  }

  private resolveEntries(
    projectFullName: string,
    kind: SdkDependencyFileKind,
    candidates: string[],
    workspaceRoot: string,
    currentSdkPath: string
  ): SdkDependencyEntry[] {
    return candidates
      .map(originalPath => this.normalizePath(originalPath))
      .filter((normalizedPath): normalizedPath is string => !!normalizedPath)
      .filter(normalizedPath => !this.isWorkspaceOwnedPath(workspaceRoot, normalizedPath))
      .map(normalizedPath => ({
        projectFullName,
        kind,
        label: path.basename(normalizedPath),
        originalPath: normalizedPath,
        resolution: this.resolveSdkPath(normalizedPath, currentSdkPath),
      }))
      .sort((left, right) => {
        const leftKey = left.resolution.relativePath ?? left.originalPath;
        const rightKey = right.resolution.relativePath ?? right.originalPath;
        return leftKey.localeCompare(rightKey, undefined, { numeric: true, sensitivity: 'base' });
      });
  }

  private resolveSdkPath(originalPath: string, currentSdkPath: string): SdkDependencyResolution {
    if (this.isPathInside(currentSdkPath, originalPath) && isFile(originalPath)) {
      return this.createResolvedResolution(currentSdkPath, originalPath);
    }

    const normalizedOriginalPath = path.normalize(originalPath);
    const parsed = path.parse(normalizedOriginalPath);
    const segments = normalizedOriginalPath
      .slice(parsed.root.length)
      .split(path.sep)
      .filter(segment => segment.length > 0);

    for (let index = 0; index < segments.length; index += 1) {
      const candidatePath = path.join(currentSdkPath, ...segments.slice(index));
      if (isFile(candidatePath)) {
        return this.createResolvedResolution(currentSdkPath, candidatePath);
      }
    }

    return {
      status: 'unresolved',
      reason: vscode.l10n.t('This path could not be mapped into the current SDK: {0}', originalPath),
    };
  }

  private createResolvedResolution(currentSdkPath: string, resolvedPath: string): SdkDependencyResolution {
    return {
      status: 'resolved',
      resolvedPath,
      relativePath: path.relative(currentSdkPath, resolvedPath),
    };
  }

  private normalizePath(inputPath: string | undefined): string | undefined {
    if (!inputPath || typeof inputPath !== 'string') {
      return undefined;
    }
    return path.normalize(inputPath);
  }

  private isWorkspaceOwnedPath(workspaceRoot: string, targetPath: string): boolean {
    return this.isPathInside(workspaceRoot, targetPath);
  }

  private isPathInside(parentPath: string, targetPath: string): boolean {
    const relativePath = path.relative(path.resolve(parentPath), path.resolve(targetPath));
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
  }

  private compareProjectNames(left: string, right: string): number {
    const leftOrder = PROJECT_ORDER.indexOf(left);
    const rightOrder = PROJECT_ORDER.indexOf(right);
    if (leftOrder !== -1 || rightOrder !== -1) {
      if (leftOrder === -1) {
        return 1;
      }
      if (rightOrder === -1) {
        return -1;
      }
      return leftOrder - rightOrder;
    }
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  }

  private cacheAndReturn(cacheKey: string, snapshot: SdkDependencySnapshot): SdkDependencySnapshot {
    return this.cacheSnapshot(cacheKey, snapshot);
  }

  private cacheSnapshot(cacheKey: string, snapshot: SdkDependencySnapshot): SdkDependencySnapshot {
    this.cachedKey = cacheKey;
    this.cachedSnapshot = snapshot;
    return snapshot;
  }

  private getFreshnessMarkerMtime(buildFolderPath: string): number | undefined {
    const markerPaths = [
      path.join(buildFolderPath, 'compile_commands.json'),
      path.join(buildFolderPath, 'bootloader', 'compile_commands.json'),
    ];

    let latestMtimeMs: number | undefined;
    for (const markerPath of markerPaths) {
      if (!fs.existsSync(markerPath)) {
        continue;
      }
      const stat = fs.statSync(markerPath);
      if (latestMtimeMs === undefined || stat.mtimeMs > latestMtimeMs) {
        latestMtimeMs = stat.mtimeMs;
      }
    }

    return latestMtimeMs;
  }
}
