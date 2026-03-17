export interface SdkVersion {
  version: string;
  path: string;
  current: boolean;
  valid: boolean;
}

export type ToolchainSource = 'github' | 'sifli';
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

export interface GitSdkMetadata {
  isGitRepo: boolean;
  ref: string;
  refType: SdkRefType;
  hash: string;
  isDirty: boolean;
  trackedBranch?: string;
  origin?: string;
  branchName?: string;
  exactTag?: string;
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

export interface GitRepository {
  github: string;
  gitee: string;
}

export interface SdkRelease {
  tagName: string;
  name?: string;
  publishedAt?: string;
  prerelease?: boolean;
}

export interface SdkBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
}
