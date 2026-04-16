import type { PeripheralSessionExecutionState } from '../peripheral-viewer/session-data';

export type DebugSnapshotModelId = 'SF32LB52X' | 'SF32LB52x' | 'SF32LB56x' | 'SF32LB58x';
export type DebugSnapshotItemKind = 'memoryRegion' | 'registerBlock';
export type DebugSnapshotRegisterSourceType = 'fixedAddress' | 'svdPeripheral';
export type DebugSnapshotCandidateSource = 'baseTemplate' | 'partTemplate' | 'dynamicPsram' | 'svdExtra';
export type DebugSnapshotTaskStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface DebugSnapshotSessionSummary {
  sessionId?: string;
  sessionName?: string;
  executionState: PeripheralSessionExecutionState;
  svdPath?: string;
  canExport: boolean;
}

export interface DebugSnapshotChipOption {
  partNumber: string;
  modelId: DebugSnapshotModelId;
  description?: string;
  psramCount: number;
  psramSummary: string;
}

export interface DebugSnapshotCandidateItem {
  id: string;
  kind: DebugSnapshotItemKind;
  name: string;
  address: number;
  size: number;
  fileName: string;
  selectedByDefault: boolean;
  source: DebugSnapshotCandidateSource;
  memoryKind?: string;
  backingMpi?: string;
  blockName?: string;
  sourceType?: DebugSnapshotRegisterSourceType;
  peripheralName?: string;
}

export interface DebugSnapshotPlan {
  session: DebugSnapshotSessionSummary;
  chip: {
    modelId: DebugSnapshotModelId;
    partNumber: string;
  };
  items: DebugSnapshotCandidateItem[];
  warnings: string[];
}

export interface DebugSnapshotBootstrap {
  session: DebugSnapshotSessionSummary;
  chipOptions: DebugSnapshotChipOption[];
  warnings: string[];
  lastOutputRoot?: string;
}

export interface DebugSnapshotOutputRootSelection {
  outputRoot?: string;
  cancelled: boolean;
}

export interface DebugSnapshotRequest {
  partNumber: string;
  outputRoot: string;
  selectedItemIds: string[];
}

export interface DebugSnapshotTaskLogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface DebugSnapshotTaskFileRecord {
  itemId: string;
  fileName: string;
  path: string;
  status: 'written' | 'skipped' | 'failed';
  size?: number;
  error?: string;
}

export interface DebugSnapshotFieldSnapshot {
  value: number;
  enumeration?: string;
}

export interface DebugSnapshotRegisterSnapshot {
  address: number;
  value: number;
  fields: Record<string, DebugSnapshotFieldSnapshot>;
}

export interface DebugSnapshotPeripheralSnapshot {
  peripheralName: string;
  baseAddress: number;
  registers: Record<string, DebugSnapshotRegisterSnapshot>;
}

export interface DebugSnapshotTaskRecord {
  taskId: string;
  partNumber: string;
  modelId?: DebugSnapshotModelId;
  request: DebugSnapshotRequest;
  status: DebugSnapshotTaskStatus;
  startedAt: string;
  finishedAt?: string;
  outputDir?: string;
  manifestPath?: string;
  logs: DebugSnapshotTaskLogEntry[];
  files: DebugSnapshotTaskFileRecord[];
  warnings: string[];
  error?: string;
}

export interface DebugSnapshotManifestItemRecord {
  id: string;
  kind: DebugSnapshotItemKind;
  name: string;
  address: number;
  size: number;
  fileName: string;
  selected: boolean;
  source: DebugSnapshotCandidateSource;
  memoryKind?: string;
  backingMpi?: string;
  blockName?: string;
  sourceType?: DebugSnapshotRegisterSourceType;
  peripheralName?: string;
}

export interface DebugSnapshotManifest {
  schemaVersion: string;
  createdAt: string;
  session: {
    sessionId?: string;
    sessionName?: string;
    executionState: PeripheralSessionExecutionState;
    svdPath?: string;
  };
  chip: {
    modelId: DebugSnapshotModelId;
    partNumber: string;
  };
  items: DebugSnapshotManifestItemRecord[];
  files: DebugSnapshotTaskFileRecord[];
  peripherals: Record<string, DebugSnapshotPeripheralSnapshot>;
  warnings: string[];
}

export type DebugSnapshotBackendEvent =
  | {
      command: 'debugSnapshotTaskUpdated';
      task: DebugSnapshotTaskRecord;
    }
  | {
      command: 'debugSnapshotTaskFinished';
      task: DebugSnapshotTaskRecord;
    }
  | {
      command: 'debugSnapshotError';
      message: string;
      taskId?: string;
    };
