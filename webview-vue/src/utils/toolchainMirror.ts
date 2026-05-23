import type { ToolchainMirrorUrls, ToolchainSource } from '@/types';

export const TOOLCHAIN_MIRROR_FIELDS: Array<{
  key: keyof ToolchainMirrorUrls;
  label: string;
  placeholder: string;
}> = [
  {
    key: 'githubAssets',
    label: 'GitHub assets 镜像',
    placeholder: 'https://downloads.sifli.com/github_assets',
  },
  {
    key: 'pypiIndex',
    label: 'PyPI 默认索引',
    placeholder: 'https://mirrors.ustc.edu.cn/pypi/simple',
  },
  {
    key: 'uvPythonDownloadsJson',
    label: 'uv Python metadata',
    placeholder: 'https://uv.agentsmirror.com/metadata/python-downloads.json',
  },
  {
    key: 'uvPypyInstallMirror',
    label: 'uv PyPy 镜像',
    placeholder: 'https://uv.agentsmirror.com/pypy',
  },
];

export function normalizeMirrorUrls(mirrorUrls?: ToolchainMirrorUrls): ToolchainMirrorUrls {
  return {
    githubAssets: mirrorUrls?.githubAssets?.trim() || '',
    pypiIndex: mirrorUrls?.pypiIndex?.trim() || '',
    uvPythonDownloadsJson: mirrorUrls?.uvPythonDownloadsJson?.trim() || '',
    uvPypyInstallMirror: mirrorUrls?.uvPypyInstallMirror?.trim() || '',
  };
}

export function compactMirrorUrls(mirrorUrls?: ToolchainMirrorUrls): ToolchainMirrorUrls | undefined {
  const normalized = normalizeMirrorUrls(mirrorUrls);
  const compact: ToolchainMirrorUrls = {};

  for (const field of TOOLCHAIN_MIRROR_FIELDS) {
    const value = normalized[field.key];
    if (value) {
      compact[field.key] = value;
    }
  }

  return Object.keys(compact).length > 0 ? compact : undefined;
}

export function validateMirrorConfig(source: ToolchainSource, mirrorUrls?: ToolchainMirrorUrls): string {
  if (source !== 'custom') {
    return '';
  }

  const normalized = normalizeMirrorUrls(mirrorUrls);
  const values = TOOLCHAIN_MIRROR_FIELDS.map(field => normalized[field.key]).filter(Boolean);

  if (values.length === 0) {
    return '手动镜像 URL 至少需要填写一项。';
  }

  const invalidField = TOOLCHAIN_MIRROR_FIELDS.find(field => {
    const value = normalized[field.key];
    return value && !/^https?:\/\//i.test(value);
  });

  return invalidField ? `${invalidField.label} 必须以 http:// 或 https:// 开头。` : '';
}

export function mirrorSourceLabel(source?: ToolchainSource): string {
  switch (source) {
    case 'sifli':
      return 'SiFli 国内镜像';
    case 'custom':
      return '手动镜像 URL';
    default:
      return '上游默认';
  }
}
