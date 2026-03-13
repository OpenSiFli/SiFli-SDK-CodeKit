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
