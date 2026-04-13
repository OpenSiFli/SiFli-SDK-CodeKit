export type ManagedUvSupportedPlatform = 'win32';
export type ManagedUvSupportedArch = 'x64' | 'arm64';

export interface ManagedUvAssetInfo {
  version: string;
  fileName: string;
  downloadUrl: string;
  archiveType: 'zip';
}

export const MANAGED_UV_VERSION = '0.11.6';

const MANAGED_UV_DOWNLOADS: Record<ManagedUvSupportedArch, string> = {
  x64: 'https://downloads.sifli.com/github_assets/astral-sh/uv/releases/download/0.11.6/uv-x86_64-pc-windows-msvc.zip',
  arm64:
    'https://downloads.sifli.com/github_assets/astral-sh/uv/releases/download/0.11.6/uv-aarch64-pc-windows-msvc.zip',
};

export function getManagedUvAssetInfo(platform: string, arch: string): ManagedUvAssetInfo | undefined {
  if (platform !== 'win32') {
    return undefined;
  }

  if (arch !== 'x64' && arch !== 'arm64') {
    return undefined;
  }

  const downloadUrl = MANAGED_UV_DOWNLOADS[arch];
  return {
    version: MANAGED_UV_VERSION,
    fileName: downloadUrl.split('/').pop() || `uv-${arch}.zip`,
    downloadUrl,
    archiveType: 'zip',
  };
}
