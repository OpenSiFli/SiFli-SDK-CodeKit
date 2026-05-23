import type { ToolchainMirrorUrls, ToolchainSource } from '@/types';

export const TOOLCHAIN_MIRROR_FIELDS: Array<{
  key: keyof ToolchainMirrorUrls;
  labelKey: string;
  placeholder: string;
}> = [
  {
    key: 'githubAssets',
    labelKey: 'sdk.toolchainMirror.fields.githubAssets',
    placeholder: 'https://downloads.sifli.com/github_assets',
  },
  {
    key: 'pypiIndex',
    labelKey: 'sdk.toolchainMirror.fields.pypiIndex',
    placeholder: 'https://mirrors.ustc.edu.cn/pypi/simple',
  },
  {
    key: 'uvPythonDownloadsJson',
    labelKey: 'sdk.toolchainMirror.fields.uvPythonDownloadsJson',
    placeholder: 'https://uv.agentsmirror.com/metadata/python-downloads.json',
  },
  {
    key: 'uvPypyInstallMirror',
    labelKey: 'sdk.toolchainMirror.fields.uvPypyInstallMirror',
    placeholder: 'https://uv.agentsmirror.com/pypy',
  },
];

export interface MirrorValidationIssue {
  type: 'required' | 'invalidUrl';
  field?: (typeof TOOLCHAIN_MIRROR_FIELDS)[number];
}

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

export function getMirrorValidationIssue(
  source: ToolchainSource,
  mirrorUrls?: ToolchainMirrorUrls
): MirrorValidationIssue | null {
  if (source !== 'custom') {
    return null;
  }

  const normalized = normalizeMirrorUrls(mirrorUrls);
  const values = TOOLCHAIN_MIRROR_FIELDS.map(field => normalized[field.key]).filter(Boolean);

  if (values.length === 0) {
    return { type: 'required' };
  }

  const invalidField = TOOLCHAIN_MIRROR_FIELDS.find(field => {
    const value = normalized[field.key];
    return value && !/^https?:\/\//i.test(value);
  });

  return invalidField ? { type: 'invalidUrl', field: invalidField } : null;
}

export function mirrorSourceLabelKey(source?: ToolchainSource): string {
  switch (source) {
    case 'sifli':
      return 'sdk.toolchainMirror.mode.sifli';
    case 'custom':
      return 'sdk.toolchainMirror.mode.custom';
    default:
      return 'sdk.toolchainMirror.mode.github';
  }
}
