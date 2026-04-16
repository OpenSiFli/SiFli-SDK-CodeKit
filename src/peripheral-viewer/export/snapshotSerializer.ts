import * as fs from 'fs';
import * as path from 'path';
import {
  DebugSnapshotCandidateItem,
  DebugSnapshotManifest,
  DebugSnapshotPeripheralSnapshot,
  DebugSnapshotTaskFileRecord,
} from '../../types/debugSnapshot';
import { PeripheralViewerSessionData } from '../session-data';

export const DEBUG_SNAPSHOT_SCHEMA_VERSION = '1.0.0';

export class SnapshotSerializer {
  public writeManifest(input: {
    outputDir: string;
    sessionData: PeripheralViewerSessionData;
    partNumber: string;
    modelId: DebugSnapshotManifest['chip']['modelId'];
    items: DebugSnapshotCandidateItem[];
    files: DebugSnapshotTaskFileRecord[];
    peripherals: Record<string, DebugSnapshotPeripheralSnapshot>;
    warnings: string[];
  }): string {
    const manifest: DebugSnapshotManifest = {
      schemaVersion: DEBUG_SNAPSHOT_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      session: {
        sessionId: input.sessionData.session.id,
        sessionName: input.sessionData.session.name,
        executionState: input.sessionData.executionState,
        svdPath: input.sessionData.svdPath,
      },
      chip: {
        modelId: input.modelId,
        partNumber: input.partNumber,
      },
      items: input.items.map(item => ({
        id: item.id,
        kind: item.kind,
        name: item.name,
        address: item.address,
        size: item.size,
        fileName: item.fileName,
        selected: true,
        source: item.source,
        memoryKind: item.memoryKind,
        backingMpi: item.backingMpi,
        blockName: item.blockName,
        sourceType: item.sourceType,
        peripheralName: item.peripheralName,
      })),
      files: input.files,
      peripherals: input.peripherals,
      warnings: input.warnings,
    };

    const manifestPath = path.join(input.outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return manifestPath;
  }
}
