import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  DebugSnapshotCandidateItem,
  DebugSnapshotPeripheralSnapshot,
  DebugSnapshotTaskFileRecord,
} from '../../types/debugSnapshot';
import { PeripheralViewerSessionData } from '../session-data';
import { SvdPeripheralCatalogService } from './svdPeripheralCatalogService';

export class DebugSnapshotCancelledError extends Error {
  constructor() {
    super('Debug snapshot export was cancelled.');
  }
}

export interface DebugSnapshotCancellationToken {
  isCancellationRequested: boolean;
}

export interface DebugSnapshotExecutionResult {
  files: DebugSnapshotTaskFileRecord[];
  peripherals: Record<string, DebugSnapshotPeripheralSnapshot>;
}

const READ_CHUNK_SIZE = 4 * 1024;

export class SnapshotExecutor {
  constructor(private readonly svdPeripheralCatalogService: SvdPeripheralCatalogService) {}

  public async execute(input: {
    sessionData: PeripheralViewerSessionData;
    outputDir: string;
    items: DebugSnapshotCandidateItem[];
    cancellationToken: DebugSnapshotCancellationToken;
    onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
  }): Promise<DebugSnapshotExecutionResult> {
    fs.mkdirSync(input.outputDir, { recursive: true });

    const files: DebugSnapshotTaskFileRecord[] = [];
    const peripherals: Record<string, DebugSnapshotPeripheralSnapshot> = {};

    for (const item of input.items) {
      this.throwIfCancelled(input.cancellationToken);

      const filePath = path.join(input.outputDir, item.fileName);
      input.onLog(`Exporting ${item.fileName} from 0x${item.address.toString(16)} (${item.size} bytes).`);

      try {
        const bytesWritten = await this.writeMemoryToFile(
          input.sessionData.session,
          item.address,
          item.size,
          filePath,
          input.cancellationToken
        );
        files.push({
          itemId: item.id,
          fileName: item.fileName,
          path: filePath,
          status: 'written',
          size: bytesWritten,
        });

        if (item.kind === 'registerBlock' && item.peripheralName) {
          const snapshot = await this.svdPeripheralCatalogService.capturePeripheralSnapshot(
            input.sessionData.session.id,
            item.peripheralName
          );
          if (snapshot) {
            peripherals[item.peripheralName] = snapshot;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        files.push({
          itemId: item.id,
          fileName: item.fileName,
          path: filePath,
          status: 'failed',
          error: message,
        });
        throw error;
      }
    }

    return {
      files,
      peripherals,
    };
  }

  private async writeMemoryToFile(
    session: vscode.DebugSession,
    address: number,
    size: number,
    filePath: string,
    cancellationToken: DebugSnapshotCancellationToken
  ): Promise<number> {
    const fileDescriptor = fs.openSync(filePath, 'w');
    let bytesWritten = 0;

    try {
      for (let offset = 0; offset < size; offset += READ_CHUNK_SIZE) {
        this.throwIfCancelled(cancellationToken);

        const chunkSize = Math.min(READ_CHUNK_SIZE, size - offset);
        const response = (await session.customRequest('readMemory', {
          memoryReference: `0x${(address + offset).toString(16)}`,
          count: chunkSize,
        })) as { data?: string } | undefined;

        if (!response?.data) {
          throw new Error(`readMemory returned no data for 0x${(address + offset).toString(16)}.`);
        }

        const bytes = Buffer.from(response.data, 'base64');
        if (bytes.length !== chunkSize) {
          throw new Error(
            `readMemory returned ${bytes.length} bytes for 0x${(address + offset).toString(16)}, expected ${chunkSize}.`
          );
        }

        fs.writeSync(fileDescriptor, bytes);
        bytesWritten += bytes.length;
      }
    } catch (error) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Ignore cleanup failures for partially written files.
      }
      throw error;
    } finally {
      fs.closeSync(fileDescriptor);
    }

    return bytesWritten;
  }

  private throwIfCancelled(cancellationToken: DebugSnapshotCancellationToken): void {
    if (cancellationToken.isCancellationRequested) {
      throw new DebugSnapshotCancelledError();
    }
  }
}
