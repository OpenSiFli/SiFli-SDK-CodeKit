import * as assert from 'assert';
import { describe, it } from 'mocha';
import {
  applySdkInstallMirrorEnvironment,
  normalizeToolchainMirrorUrls,
  validateToolchainMirrorConfig,
} from '../utils/sdkInstallMirrorEnv';

describe('sdkInstallMirrorEnv', () => {
  it('does not inject mirror variables for the upstream source', () => {
    const env: NodeJS.ProcessEnv = {};
    const applied = applySdkInstallMirrorEnvironment(env, 'github');

    assert.deepStrictEqual(applied, { source: 'github', keys: [] });
    assert.deepStrictEqual(env, {});
  });

  it('uses the SiFli SDK mirror preset switch for the SiFli source', () => {
    const env: NodeJS.ProcessEnv = {};
    const applied = applySdkInstallMirrorEnvironment(env, 'sifli');

    assert.deepStrictEqual(applied, { source: 'sifli', keys: ['SIFLI_SDK_MIRROR_CHINA'] });
    assert.strictEqual(env.SIFLI_SDK_MIRROR_CHINA, 'true');
    assert.strictEqual(env.SIFLI_SDK_GITHUB_ASSETS, undefined);
    assert.strictEqual(env.PIP_INDEX_URL, undefined);
  });

  it('injects fixed custom mirror URL variables', () => {
    const env: NodeJS.ProcessEnv = {};
    const applied = applySdkInstallMirrorEnvironment(env, 'custom', {
      githubAssets: 'https://mirror.example/github_assets',
      pypiIndex: 'https://mirror.example/pypi/simple',
      uvPythonDownloadsJson: 'https://mirror.example/python-downloads.json',
      uvPypyInstallMirror: 'https://mirror.example/pypy',
    });

    assert.deepStrictEqual(applied.keys, [
      'SIFLI_SDK_GITHUB_ASSETS',
      'SIFLI_SDK_PYPI_DEFAULT_INDEX',
      'UV_DEFAULT_INDEX',
      'UV_INDEX_URL',
      'PIP_INDEX_URL',
      'UV_PYTHON_DOWNLOADS_JSON_URL',
      'UV_PYPY_INSTALL_MIRROR',
    ]);
    assert.strictEqual(env.SIFLI_SDK_GITHUB_ASSETS, 'https://mirror.example/github_assets');
    assert.strictEqual(env.SIFLI_SDK_PYPI_DEFAULT_INDEX, 'https://mirror.example/pypi/simple');
    assert.strictEqual(env.UV_DEFAULT_INDEX, 'https://mirror.example/pypi/simple');
    assert.strictEqual(env.UV_INDEX_URL, 'https://mirror.example/pypi/simple');
    assert.strictEqual(env.PIP_INDEX_URL, 'https://mirror.example/pypi/simple');
    assert.strictEqual(env.UV_PYTHON_DOWNLOADS_JSON_URL, 'https://mirror.example/python-downloads.json');
    assert.strictEqual(env.UV_PYPY_INSTALL_MIRROR, 'https://mirror.example/pypy');
  });

  it('validates custom mirror URLs', () => {
    assert.deepStrictEqual(validateToolchainMirrorConfig('custom'), ['手动镜像 URL 至少需要填写一项。']);
    assert.deepStrictEqual(validateToolchainMirrorConfig('custom', { pypiIndex: 'ftp://example/simple' }), [
      '手动镜像 URL 必须以 http:// 或 https:// 开头: pypiIndex',
    ]);
  });

  it('trims and removes empty custom mirror URLs', () => {
    assert.deepStrictEqual(normalizeToolchainMirrorUrls({ pypiIndex: ' https://example/simple ', githubAssets: ' ' }), {
      pypiIndex: 'https://example/simple',
    });
  });
});
