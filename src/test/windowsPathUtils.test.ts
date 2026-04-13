import * as assert from 'assert';
import { describe, it } from 'mocha';
import { buildWindowsPowerShellPathCommand, prependWindowsPathEntries } from '../utils/windowsPathUtils';

describe('windowsPathUtils', () => {
  it('prepends entries in order and removes case-insensitive duplicates from the existing PATH', () => {
    const currentPath = 'C:\\Git\\cmd;C:\\Python;C:\\Python\\Scripts;C:\\Windows\\System32';
    const nextPath = prependWindowsPathEntries(currentPath, ['C:\\uv', 'c:\\python', 'C:\\Python\\Scripts']);

    assert.strictEqual(nextPath, 'C:\\uv;c:\\python;C:\\Python\\Scripts;C:\\Git\\cmd;C:\\Windows\\System32');
  });

  it('deduplicates duplicate requested entries while preserving the first occurrence', () => {
    const nextPath = prependWindowsPathEntries('C:\\Windows\\System32', ['C:\\uv', 'c:\\UV', 'C:\\Python']);

    assert.strictEqual(nextPath, 'C:\\uv;C:\\Python;C:\\Windows\\System32');
  });

  it('builds a single PowerShell command for prepending managed paths', () => {
    assert.strictEqual(
      buildWindowsPowerShellPathCommand(['C:\\uv', 'C:\\Python', 'C:\\Python\\Scripts']),
      '$env:Path = "C:\\uv;C:\\Python;C:\\Python\\Scripts;" + $env:Path'
    );
  });

  it('returns undefined when no path entries are provided', () => {
    assert.strictEqual(buildWindowsPowerShellPathCommand([]), undefined);
  });
});
