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
  tag_name: string;
  name: string;
  published_at: string;
  tarball_url: string;
  zipball_url: string;
}

export interface SdkBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
}
