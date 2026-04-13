import * as assert from 'assert';
import { describe, it } from 'mocha';
import { MANAGED_UV_VERSION, getManagedUvAssetInfo } from '../utils/uvAssetUtils';

describe('uvAssetUtils', () => {
  it('returns the x64 Windows managed uv asset', () => {
    const asset = getManagedUvAssetInfo('win32', 'x64');

    assert.ok(asset);
    assert.strictEqual(asset?.version, MANAGED_UV_VERSION);
    assert.strictEqual(asset?.fileName, 'uv-x86_64-pc-windows-msvc.zip');
    assert.strictEqual(
      asset?.downloadUrl,
      'https://downloads.sifli.com/github_assets/astral-sh/uv/releases/download/0.11.6/uv-x86_64-pc-windows-msvc.zip'
    );
  });

  it('returns the arm64 Windows managed uv asset', () => {
    const asset = getManagedUvAssetInfo('win32', 'arm64');

    assert.ok(asset);
    assert.strictEqual(asset?.version, MANAGED_UV_VERSION);
    assert.strictEqual(asset?.fileName, 'uv-aarch64-pc-windows-msvc.zip');
    assert.strictEqual(
      asset?.downloadUrl,
      'https://downloads.sifli.com/github_assets/astral-sh/uv/releases/download/0.11.6/uv-aarch64-pc-windows-msvc.zip'
    );
  });

  it('does not return a managed uv asset for unsupported Windows architectures', () => {
    assert.strictEqual(getManagedUvAssetInfo('win32', 'ia32'), undefined);
  });

  it('does not return a managed uv asset for non-Windows platforms', () => {
    assert.strictEqual(getManagedUvAssetInfo('darwin', 'arm64'), undefined);
    assert.strictEqual(getManagedUvAssetInfo('linux', 'x64'), undefined);
  });
});
