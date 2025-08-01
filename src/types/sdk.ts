export interface SdkVersion {
  version: string;
  path: string;
  current: boolean;
  valid: boolean;
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
