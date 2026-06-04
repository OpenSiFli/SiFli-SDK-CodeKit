import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryMapSnapshot } from '../types/memoryMap';
import { resolveMainMapPath } from '../utils/memoryMapPathUtils';
import { getProjectInfo } from '../utils/projectUtils';
import { parseGnuMap } from '../utils/gnuMapParser';
import { BoardService } from './boardService';
import { ConfigService } from './configService';
import { LogService } from './logService';

interface CachedMemoryMapSnapshot {
  snapshot: MemoryMapSnapshot;
  mapPath: string;
  mtimeMs: number;
}

export class MemoryMapService {
  private static instance: MemoryMapService;

  private readonly boardService: BoardService;
  private readonly configService: ConfigService;
  private readonly logService: LogService;
  private cached?: CachedMemoryMapSnapshot;

  private constructor() {
    this.boardService = BoardService.getInstance();
    this.configService = ConfigService.getInstance();
    this.logService = LogService.getInstance();
  }

  public static getInstance(): MemoryMapService {
    if (!MemoryMapService.instance) {
      MemoryMapService.instance = new MemoryMapService();
    }
    return MemoryMapService.instance;
  }

  public getCachedSnapshot(): MemoryMapSnapshot | undefined {
    return this.cached?.snapshot;
  }

  public getCachedMapPath(): string | undefined {
    return this.cached?.mapPath;
  }

  public async getSnapshot(options?: { refreshIfStale?: boolean }): Promise<MemoryMapSnapshot> {
    if (!options?.refreshIfStale && this.cached) {
      return this.cached.snapshot;
    }
    return this.analyzeCurrentMainMap();
  }

  public async analyzeCurrentMainMap(): Promise<MemoryMapSnapshot> {
    const context = this.resolveCurrentMainMapContext();
    const stat = await this.statMapFile(context.mapPath);

    if (this.cached && this.cached.mapPath === context.mapPath && this.cached.mtimeMs === stat.mtimeMs) {
      return this.cached.snapshot;
    }

    this.logService.info(`Analyzing GNU memory map: ${context.mapPath}`);
    const content = await fs.promises.readFile(context.mapPath, 'utf8');
    const snapshot = parseGnuMap(content, {
      mapPath: context.mapPath,
      mapFileName: path.basename(context.mapPath),
      buildPath: context.buildPath,
      boardName: context.boardName,
      modifiedAt: stat.mtime.toISOString(),
    });

    this.cached = {
      snapshot,
      mapPath: context.mapPath,
      mtimeMs: stat.mtimeMs,
    };
    return snapshot;
  }

  public async openLocation(mapPath: string | undefined, line: number | undefined): Promise<void> {
    const targetPath = mapPath || this.cached?.mapPath;
    if (!targetPath) {
      throw new Error(vscode.l10n.t('No memory map file is available.'));
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
    const editor = await vscode.window.showTextDocument(document, { preserveFocus: false });
    if (line && line > 0) {
      const position = new vscode.Position(Math.max(line - 1, 0), 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
  }

  public resolveCurrentMainMapContext(): {
    boardName: string;
    buildFolder: string;
    buildPath: string;
    mapPath: string;
  } {
    const boardName = this.configService.getSelectedBoardName();
    if (!boardName || boardName === 'N/A') {
      throw new Error(vscode.l10n.t('Select a SiFli board first. Click the board name in the status bar.'));
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error(vscode.l10n.t('No workspace folder is open.'));
    }

    const projectInfo = getProjectInfo();
    if (!projectInfo) {
      throw new Error(vscode.l10n.t('Current workspace is not a SiFli project.'));
    }

    const buildFolder = this.boardService.getBuildTargetFolder(boardName);
    const buildPath = path.join(workspaceRoot, buildFolder);
    return {
      boardName,
      buildFolder,
      buildPath,
      mapPath: resolveMainMapPath(workspaceRoot, buildFolder),
    };
  }

  private async statMapFile(mapPath: string): Promise<fs.Stats> {
    try {
      return await fs.promises.stat(mapPath);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new Error(vscode.l10n.t('Memory map file was not found: {0}', mapPath));
      }
      throw error;
    }
  }
}
