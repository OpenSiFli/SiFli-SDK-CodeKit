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
export type ToolchainSource = 'github' | 'sifli';
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
