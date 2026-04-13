import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, it } from 'mocha';
import { formatInstallScriptFailure, inferPowerShellKind, resolvePowerShellExecutable } from '../utils/powerShellUtils';

describe('powerShellUtils', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps an explicitly configured pwsh path', () => {
    const configuredPath = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
    const resolved = resolvePowerShellExecutable(configuredPath, { platform: 'win32' });

    assert.strictEqual(resolved.executablePath, configuredPath);
    assert.strictEqual(resolved.kind, 'pwsh');
    assert.strictEqual(resolved.source, 'configured');
  });

  it('auto-detects pwsh before falling back to Windows PowerShell', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwsh-first-'));
    tempDirs.push(binDir);
    const pwshPath = path.join(binDir, 'pwsh.EXE');
    fs.writeFileSync(pwshPath, '');

    const resolved = resolvePowerShellExecutable(undefined, {
      platform: 'win32',
      envPath: binDir,
      envPathExt: '.EXE;.CMD',
    });

    assert.strictEqual(resolved.executablePath, pwshPath);
    assert.strictEqual(resolved.kind, 'pwsh');
    assert.strictEqual(resolved.source, 'auto-pwsh');
  });

  it('falls back to powershell.exe when pwsh is not on PATH', () => {
    const resolved = resolvePowerShellExecutable(undefined, {
      platform: 'win32',
      envPath: '',
      envPathExt: '.EXE;.CMD',
    });

    assert.strictEqual(resolved.executablePath, 'powershell.exe');
    assert.strictEqual(resolved.kind, 'powershell');
    assert.strictEqual(resolved.source, 'auto-powershell');
  });

  it('infers Windows PowerShell for non-pwsh executables', () => {
    assert.strictEqual(inferPowerShellKind('powershell.exe'), 'powershell');
    assert.strictEqual(
      inferPowerShellKind('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'),
      'powershell'
    );
  });

  it('appends the PowerShell 7 upgrade hint only for Windows PowerShell on Windows', () => {
    const hint = 'Please update to PowerShell 7.';
    assert.strictEqual(
      formatInstallScriptFailure('install failed', 'powershell', hint, 'win32'),
      'install failed\nPlease update to PowerShell 7.'
    );
    assert.strictEqual(formatInstallScriptFailure('install failed', 'pwsh', hint, 'win32'), 'install failed');
    assert.strictEqual(formatInstallScriptFailure('install failed', 'powershell', hint, 'linux'), 'install failed');
  });
});
