import * as vscode from 'vscode';
import { parseStringPromise } from 'xml2js';
import { DEFAULT_ADDR_GAP, SETTINGS_ADDRESS_GAP_THRESHOLD, SETTINGS_NAMESPACE } from './manifest';
import { SvdData, SVDParser } from './svd-parser';
import { SvdResolver } from './svd-resolver';
import { PeripheralNode } from './views/nodes/peripheralnode';

interface ParsedSvdCacheEntry {
  mtime: number;
  svdData: SvdData;
  deviceName?: string;
}

export interface LoadedPeripheralSet {
  peripherals: PeripheralNode[];
  svdPath: string;
  deviceName?: string;
}

const parsedSvdCache = new Map<string, ParsedSvdCacheEntry>();

export class PeripheralsProvider {
  private readonly svdResolver = new SvdResolver();

  constructor(private readonly session: vscode.DebugSession) {}

  public getSession(): vscode.DebugSession {
    return this.session;
  }

  public cacheKey(): string | undefined {
    return this.svdResolver.resolve(this.session)?.path;
  }

  public async getPeripherals(): Promise<LoadedPeripheralSet> {
    const resolvedSvd = this.svdResolver.resolve(this.session);
    if (!resolvedSvd) {
      throw new Error(
        vscode.l10n.t(
          'No SVD file configured for Peripheral Viewer. Set "sifli-sdk-codekit.peripheralViewer.svdFile" or "coreConfigs[].peripheralViewerSvdFile".'
        )
      );
    }

    const uri = vscode.Uri.file(resolvedSvd.path);
    await vscode.workspace.fs.stat(uri);
    const { svdData, deviceName } = await this.loadSvdData(uri);

    const parser = new SVDParser();
    const peripherals = await parser.parseSVD(svdData, this.getAddressGapThreshold());

    return {
      peripherals,
      svdPath: resolvedSvd.path,
      deviceName,
    };
  }

  private getAddressGapThreshold(): number {
    const scope = this.session.workspaceFolder?.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
    const config = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE, scope);
    const threshold = config.get<number>(SETTINGS_ADDRESS_GAP_THRESHOLD) ?? DEFAULT_ADDR_GAP;
    return Math.max(0, Math.min(Math.trunc(threshold), 32));
  }

  private async loadSvdData(uri: vscode.Uri): Promise<ParsedSvdCacheEntry> {
    const stat = await vscode.workspace.fs.stat(uri);
    const cacheEntry = parsedSvdCache.get(uri.fsPath);
    if (cacheEntry && cacheEntry.mtime === stat.mtime) {
      return cacheEntry;
    }

    const raw = await vscode.workspace.fs.readFile(uri);
    const xml = new TextDecoder().decode(raw);
    const svdData = (await parseStringPromise(xml)) as SvdData;
    const nextEntry: ParsedSvdCacheEntry = {
      mtime: stat.mtime,
      svdData,
      deviceName: svdData.device?.name?.[0],
    };
    parsedSvdCache.set(uri.fsPath, nextEntry);
    return nextEntry;
  }
}
