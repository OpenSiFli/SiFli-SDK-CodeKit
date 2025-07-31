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
}

export interface SdkBranch {
  name: string;
  commit?: {
    sha: string;
    url: string;
  };
}

export type SdkSource = 'github' | 'gitee';
export type DownloadType = 'release' | 'branch';

// 消息类型
export interface WebviewMessage {
  command: string;
  [key: string]: any;
}

// SDK 管理器状态
export interface SdkManagerState {
  sdkSource: SdkSource;
  downloadType: DownloadType;
  availableReleases: SdkRelease[];
  availableBranches: SdkBranch[];
  selectedVersion: string;
  selectedBranch: string;
  installPath: string;
  isLoading: boolean;
  isInstalling: boolean;
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
