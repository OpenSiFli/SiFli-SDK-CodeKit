import { ToolchainMirrorUrls, ToolchainSource } from '../types';

const SIFLI_MIRROR_ENV = 'SIFLI_SDK_MIRROR_CHINA';
const GITHUB_ASSETS_ENV = 'SIFLI_SDK_GITHUB_ASSETS';
const PYPI_INDEX_ENV = 'SIFLI_SDK_PYPI_DEFAULT_INDEX';
const UV_DEFAULT_INDEX_ENV = 'UV_DEFAULT_INDEX';
const UV_INDEX_URL_ENV = 'UV_INDEX_URL';
const PIP_INDEX_URL_ENV = 'PIP_INDEX_URL';
const UV_PYTHON_DOWNLOADS_JSON_ENV = 'UV_PYTHON_DOWNLOADS_JSON_URL';
const UV_PYPY_INSTALL_MIRROR_ENV = 'UV_PYPY_INSTALL_MIRROR';

export interface AppliedSdkInstallMirrorEnv {
  source: ToolchainSource;
  keys: string[];
}

export function normalizeToolchainMirrorUrls(mirrorUrls?: ToolchainMirrorUrls): ToolchainMirrorUrls | undefined {
  if (!mirrorUrls) {
    return undefined;
  }

  const normalized: ToolchainMirrorUrls = {
    githubAssets: mirrorUrls.githubAssets?.trim(),
    pypiIndex: mirrorUrls.pypiIndex?.trim(),
    uvPythonDownloadsJson: mirrorUrls.uvPythonDownloadsJson?.trim(),
    uvPypyInstallMirror: mirrorUrls.uvPypyInstallMirror?.trim(),
  };

  const compact: ToolchainMirrorUrls = {};
  for (const [key, value] of Object.entries(normalized)) {
    if (value) {
      compact[key as keyof ToolchainMirrorUrls] = value;
    }
  }

  return Object.keys(compact).length > 0 ? compact : undefined;
}

export function validateToolchainMirrorConfig(
  source: ToolchainSource | undefined,
  mirrorUrls?: ToolchainMirrorUrls
): string[] {
  if (source !== 'custom') {
    return [];
  }

  const normalized = normalizeToolchainMirrorUrls(mirrorUrls);
  const errors: string[] = [];

  if (!normalized) {
    errors.push('手动镜像 URL 至少需要填写一项。');
    return errors;
  }

  for (const [key, value] of Object.entries(normalized)) {
    if (!/^https?:\/\//i.test(value)) {
      errors.push(`手动镜像 URL 必须以 http:// 或 https:// 开头: ${key}`);
    }
  }

  return errors;
}

export function applySdkInstallMirrorEnvironment(
  env: NodeJS.ProcessEnv,
  source: ToolchainSource | undefined,
  mirrorUrls?: ToolchainMirrorUrls
): AppliedSdkInstallMirrorEnv {
  const resolvedSource = source ?? 'github';

  if (resolvedSource === 'github') {
    return { source: resolvedSource, keys: [] };
  }

  if (resolvedSource === 'sifli') {
    env[SIFLI_MIRROR_ENV] = 'true';
    return { source: resolvedSource, keys: [SIFLI_MIRROR_ENV] };
  }

  const errors = validateToolchainMirrorConfig(resolvedSource, mirrorUrls);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const normalized = normalizeToolchainMirrorUrls(mirrorUrls);
  const keys: string[] = [];

  if (normalized?.githubAssets) {
    env[GITHUB_ASSETS_ENV] = normalized.githubAssets;
    keys.push(GITHUB_ASSETS_ENV);
  }

  if (normalized?.pypiIndex) {
    env[PYPI_INDEX_ENV] = normalized.pypiIndex;
    env[UV_DEFAULT_INDEX_ENV] = normalized.pypiIndex;
    env[UV_INDEX_URL_ENV] = normalized.pypiIndex;
    env[PIP_INDEX_URL_ENV] = normalized.pypiIndex;
    keys.push(PYPI_INDEX_ENV, UV_DEFAULT_INDEX_ENV, UV_INDEX_URL_ENV, PIP_INDEX_URL_ENV);
  }

  if (normalized?.uvPythonDownloadsJson) {
    env[UV_PYTHON_DOWNLOADS_JSON_ENV] = normalized.uvPythonDownloadsJson;
    keys.push(UV_PYTHON_DOWNLOADS_JSON_ENV);
  }

  if (normalized?.uvPypyInstallMirror) {
    env[UV_PYPY_INSTALL_MIRROR_ENV] = normalized.uvPypyInstallMirror;
    keys.push(UV_PYPY_INSTALL_MIRROR_ENV);
  }

  return { source: resolvedSource, keys };
}
