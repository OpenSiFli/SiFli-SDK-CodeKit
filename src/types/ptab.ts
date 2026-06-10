export type PtabSourceMode = 'board' | 'project_full' | 'overlay';

export type PtabBoardSource = 'sdk' | 'custom' | 'project_local' | 'unknown';

export type PtabEditTargetKind = 'project_overlay' | 'project_chip_overlay' | 'project_full';

export type PtabPartitionOperation = 'override' | 'add';

export type PtabSizeUnit = 'B' | 'KB' | 'MB' | 'GB';

export interface PtabValidationIssue {
  severity: 'error' | 'warning';
  message: string;
}

export interface PtabOverlayOperation {
  layer: 'chip' | 'board';
  kind: PtabPartitionOperation;
  mode: 'explicit' | 'inferred';
  name: string;
  fields: string[];
  source: string;
}

export interface PtabEditTarget {
  kind: PtabEditTargetKind;
  label: string;
  path: string;
  editable: boolean;
  exists: boolean;
  recommended?: boolean;
  reason?: string;
}

export interface PtabRegionUsage {
  name: string;
  memory_type: string;
  base_address: number | null;
  base_address_hex: string | null;
  total_bytes: number | null;
  total_hex: string | null;
  used_bytes: number;
  used_hex: string;
  free_bytes: number | null;
  free_hex: string | null;
  usage_percent: number | null;
  entry_count: number;
  overlap_count: number;
}

export interface PtabUsageEntry {
  name: string;
  kind: 'storage' | 'exec';
  region: string;
  source_region: string;
  type: string;
  subtype?: string | null;
  core?: string | null;
  offset: number;
  offset_hex: string | null;
  end_offset: number;
  end_offset_hex: string | null;
  size_bytes: number;
  size_hex: string | null;
  address: number | null;
  address_hex: string | null;
  memory_type: string;
}

export interface PtabGap {
  region: string;
  offset: number;
  offset_hex: string | null;
  end_offset: number;
  end_offset_hex: string | null;
  size_bytes: number;
  size_hex: string | null;
}

export interface PtabOverlap {
  region: string;
  entries: string[];
  kinds: string[];
  offset: number;
  offset_hex: string | null;
  end_offset: number;
  end_offset_hex: string | null;
  size_bytes: number;
  size_hex: string | null;
}

export interface PtabPartitionExec {
  region: string;
  offset: string | number;
}

export interface PtabPartitionSectionSelector {
  object?: string;
  section: string;
}

export interface PtabPartition {
  name: string;
  type: string;
  subtype?: string | null;
  region: string;
  offset: string | number;
  offset_bytes: number;
  offset_hex: string | null;
  end_offset: number;
  end_offset_hex: string | null;
  size: string | number;
  size_bytes: number;
  size_hex: string | null;
  core?: string | null;
  attrs?: Record<string, unknown>;
  aliases?: string[];
  exec?: PtabPartitionExec | null;
  sections?: PtabPartitionSectionSelector[];
  source?: 'base' | 'project' | 'chip_overlay' | 'board_overlay' | 'generated';
  overlayFields?: string[];
  overlayOperation?: PtabPartitionOperation;
}

export interface PtabSourcePaths {
  basePath?: string | null;
  effectivePath?: string | null;
  boardPath?: string | null;
  projectFullPtab?: string | null;
  projectYamlPtab?: string | null;
  overlayPaths: {
    chip?: string | null;
    board?: string | null;
  };
}

export interface PtabSnapshot {
  schemaVersion: 1;
  sdk: {
    path: string;
    ref: string;
    hash: string;
  };
  workspaceRoot: string;
  projectPath: string;
  boardName: string;
  normalizedBoardName: string;
  boardSource: PtabBoardSource;
  chip: string;
  chipDir: string;
  sourceMode: PtabSourceMode;
  usesOverlay: boolean;
  paths: PtabSourcePaths;
  editTargets: PtabEditTarget[];
  regions: PtabRegionUsage[];
  partitions: PtabPartition[];
  usageEntries: PtabUsageEntry[];
  gaps: PtabGap[];
  overlaps: PtabOverlap[];
  validation: PtabValidationIssue[];
  overlayOperations: PtabOverlayOperation[];
}

export interface PtabPartitionDraft {
  originalName?: string;
  name: string;
  operation?: PtabPartitionOperation;
  type: string;
  subtype?: string;
  region: string;
  offset: string;
  offsetValue?: string;
  offsetUnit?: PtabSizeUnit;
  size: string;
  sizeValue?: string;
  sizeUnit?: PtabSizeUnit;
  core?: string;
  execRegion?: string;
  execOffset?: string;
  execOffsetValue?: string;
  execOffsetUnit?: PtabSizeUnit;
  attrsYaml?: string;
  aliasesYaml?: string;
  sectionsYaml?: string;
}

export interface PtabChangeRequest {
  targetKind: PtabEditTargetKind;
  changes: PtabPartitionDraft[];
}
