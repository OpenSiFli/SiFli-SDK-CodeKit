// VS Code API 相关类型
export interface VSCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

// SDK 相关类型
export interface SdkRelease {
  tagName: string;
  name?: string;
  publishedAt?: string;
  prerelease?: boolean;
  supportedChips?: string[];
}

export interface SdkBranch {
  name: string;
  supportedChips?: string[];
  commit?: {
    sha: string;
    url: string;
  };
}

// 统一 API 版本信息类型
export interface SdkVersionInfo {
  version: string;
  supported_chips: string[];
  type?: 'branch'; // 如果存在则为分支，否则为发布版本
}

export type SdkSource = 'github' | 'gitee';
export type ToolchainSource = 'github' | 'sifli' | 'custom';
export interface ToolchainMirrorUrls {
  githubAssets?: string;
  pypiIndex?: string;
  uvPythonDownloadsJson?: string;
  uvPypyInstallMirror?: string;
}
export type DownloadType = 'release' | 'branch';
export type SdkRefType = 'branch' | 'tag' | 'detached' | 'unknown';
export type SdkTaskKind =
  | 'install'
  | 'import'
  | 'switch-ref'
  | 'update-branch'
  | 'rename-directory'
  | 'update-tools'
  | 'remove-sdk'
  | 'edit-toolchain';

export interface ManagedSdkActions {
  canActivate: boolean;
  canSwitchRef: boolean;
  canUpdateBranch: boolean;
  canRename: boolean;
  canUpdateTools: boolean;
  canRemove: boolean;
  canEditToolchain: boolean;
}

export interface ManagedSdkSummary {
  id: string;
  name: string;
  version: string;
  path: string;
  current: boolean;
  isCurrent: boolean;
  valid: boolean;
  isGitRepo: boolean;
  ref: string;
  refType: SdkRefType;
  hash: string;
  isDirty: boolean;
  canUpdate: boolean;
  toolsPath?: string;
  toolchainSource?: ToolchainSource;
  toolchainMirrorUrls?: ToolchainMirrorUrls;
  actions: ManagedSdkActions;
}

export interface ManagedSdkDetail extends ManagedSdkSummary {
  origin?: string;
  trackedBranch?: string;
  hasInstallScript: boolean;
  hasExportScript: boolean;
  hasVersionFile: boolean;
  lastError?: string;
}

export interface SdkTarget {
  kind: 'branch' | 'tag';
  label: string;
  ref: string;
  version: string;
  defaultDirectoryName: string;
  supportedChips: string[];
}

export interface TaskLogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface SdkTaskRecord {
  id: string;
  kind: SdkTaskKind;
  title: string;
  sdkId?: string;
  sdkPath?: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt?: string;
  logs: TaskLogEntry[];
  result?: {
    sdkId?: string;
    path?: string;
    ref?: string;
    hash?: string;
  };
  error?: string;
}

export type KconfigNodeKind = 'menu' | 'comment' | 'choice' | 'symbol' | 'choice-item';

export interface KconfigNode {
  id: string;
  kind: KconfigNodeKind;
  prompt: string;
  symbol: string;
  type: string;
  value: string;
  assignable: string[];
  visible: boolean;
  editable: boolean;
  help: string;
  location: string;
  dependsOn?: string;
  choiceId?: string;
  children: KconfigNode[];
}

export interface KconfigSnapshot {
  projectRoot: string;
  projectPath: string;
  sdkPath: string;
  boardName: string;
  configFile: string;
  nodes: KconfigNode[];
  warnings: string[];
  dirty: boolean;
  generatedFiles?: string[];
}

export interface KconfigChange {
  symbol: string;
  value: string;
}

export type AnalysisViewMode = 'peripheral' | 'severity';
export type AnalysisSeverity = 'info' | 'warning' | 'error';
export type AnalysisSeverityFilter = 'all' | 'warning' | 'error';
export type AnalysisStatusFilter = 'all' | 'issues' | 'clean';
export type AnalysisBucketId = 'error' | 'warning' | 'clean' | 'not-analyzed';

export interface AnalysisFilterState {
  severity: AnalysisSeverityFilter;
  status: AnalysisStatusFilter;
  groups: string[];
}

export interface AnalysisSummary {
  totalGroups: number;
  visibleGroups: number;
  totalInstances: number;
  visibleInstances: number;
  errorCount: number;
  warningCount: number;
  issueCount: number;
  cleanCount: number;
  notAnalyzedCount: number;
}

export interface AnalysisFindingPresentation {
  id: string;
  severity: AnalysisSeverity;
  message: string;
  suggestion?: string;
  relatedPeripheral?: string;
  relatedRegister?: string;
  groupName: string;
  peripheralName: string;
}

export interface AnalysisInstancePresentation {
  id: string;
  peripheralName: string;
  groupName: string;
  status: 'not-analyzed' | 'ok' | 'issues';
  findings: AnalysisFindingPresentation[];
  errorCount: number;
  warningCount: number;
  issueCount: number;
  cleanCount: number;
  notAnalyzedCount: number;
}

export interface AnalysisGroupPresentation {
  id: string;
  groupName: string;
  instances: AnalysisInstancePresentation[];
  errorCount: number;
  warningCount: number;
  issueCount: number;
  cleanCount: number;
  notAnalyzedCount: number;
}

export interface AnalysisBucketPresentation {
  id: AnalysisBucketId;
  label: string;
  groups: AnalysisGroupPresentation[];
  errorCount: number;
  warningCount: number;
  issueCount: number;
  cleanCount: number;
  notAnalyzedCount: number;
}

export interface AnalysisPresentationSnapshot {
  hasActiveSession: boolean;
  sessionId?: string;
  chipModel?: string;
  deviceName?: string;
  message?: string;
  viewMode: AnalysisViewMode;
  filters: AnalysisFilterState;
  availableGroups: string[];
  summary: AnalysisSummary;
  groups: AnalysisGroupPresentation[];
  buckets: AnalysisBucketPresentation[];
}

export interface SdkInstallVersionPayload {
  name: string;
  type: DownloadType;
  tagName?: string;
  gitRef?: string;
}

export interface SdkInstallRequestData {
  sdkSource: SdkSource;
  version: SdkInstallVersionPayload;
  installPath: string;
  toolchainSource: ToolchainSource;
  toolchainMirrorUrls?: ToolchainMirrorUrls;
  toolsPath: string;
}

// 消息类型
export interface WebviewMessage {
  command: string;
  [key: string]: any;
}

export interface TaskStartedMessage {
  taskId: string;
  task: SdkTaskRecord;
}

export interface TaskSnapshotMessage {
  task: SdkTaskRecord;
}

export interface TaskLogMessage {
  taskId: string;
  entry: TaskLogEntry;
}

export type SerialLogSource = 'device' | 'user' | 'mcp' | 'system' | 'error';
export type SerialSendMode = 'text' | 'hex';
export type SerialLineEnding = 'none' | 'lf' | 'crlf';

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
}

export interface SerialLogEntry {
  id: number;
  timestamp: string;
  source: SerialLogSource;
  text: string;
  hex: string;
  byteLength: number;
}

export interface SerialMonitorStatus {
  connectionId?: string;
  connected: boolean;
  port?: string;
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: string;
  logCount: number;
}

export interface SerialMonitorSnapshot {
  status: SerialMonitorStatus;
  entries: SerialLogEntry[];
  ports: SerialPortInfo[];
  defaultLineEnding: SerialLineEnding;
  reset: {
    dtr: boolean;
    rts: boolean;
    activeMs: number;
    settleMs: number;
  };
  settings: {
    showTimestamp: boolean;
    renderAnsi: boolean;
    logBaudRate: number;
  };
}

export interface MemoryRegionUsage {
  name: string;
  origin: number;
  length: number;
  attributes?: string;
  runtimeUsed: number;
  loadUsed: number;
  runtimePercent?: number;
  loadPercent?: number;
}

export interface MemorySectionUsage {
  name: string;
  address: number;
  size: number;
  loadAddress?: number;
  regionName?: string;
  loadRegionName?: string;
}

export interface MemorySymbolEntry {
  name: string;
  section: string;
  outputSection: string;
  objectPath: string;
  regionName?: string;
  address: number;
  size: number;
  line: number;
}

export interface MemoryMapSnapshot {
  format: 'gnu';
  mapPath: string;
  mapFileName: string;
  buildPath?: string;
  boardName?: string;
  parsedAt: string;
  modifiedAt?: string;
  totalRuntimeBytes: number;
  totalLoadBytes: number;
  regions: MemoryRegionUsage[];
  sections: MemorySectionUsage[];
  topSymbols: MemorySymbolEntry[];
  warnings: string[];
}

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

// SDK 管理器状态
export interface SdkManagerState {
  sdkSource: SdkSource;
  downloadType: DownloadType;
  availableVersions: SdkVersionInfo[]; // 统一版本信息
  availableReleases: SdkRelease[];
  availableBranches: SdkBranch[];
  selectedVersion: string;
  selectedBranch: string;
  installPath: string;
  toolchainSource: ToolchainSource;
  toolsPath: string;
  isLoading: boolean;
  isInstalling: boolean;
  installationProgress: {
    message: string;
    percentage: number;
  };
  installationLogs: string[]; // 新增安装日志数组
}

// 组件 Props 类型
export interface BaseSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface BaseButtonProps {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
}

export interface BaseInputProps {
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  type?: 'text' | 'password' | 'email' | 'number';
}

export interface BaseSelectProps {
  modelValue?: string;
  options: BaseSelectOption[];
  disabled?: boolean;
  placeholder?: string;
}

// Debug Snapshot types
export type DebugSnapshotModelId = 'SF32LB52X' | 'SF32LB52x' | 'SF32LB56x' | 'SF32LB58x';
export type DebugSnapshotItemKind = 'memoryRegion' | 'registerBlock';
export type DebugSnapshotRegisterSourceType = 'fixedAddress' | 'svdPeripheral';
export type DebugSnapshotCandidateSource = 'baseTemplate' | 'partTemplate' | 'dynamicPsram' | 'svdExtra';
export type DebugSnapshotTaskStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface DebugSnapshotSessionSummary {
  sessionId?: string;
  sessionName?: string;
  executionState: 'unknown' | 'running' | 'stopped';
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
