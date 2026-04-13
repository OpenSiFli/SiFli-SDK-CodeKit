import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, it } from 'mocha';
import { findFileRecursively } from '../utils/managedToolUtils';

describe('managedToolUtils', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('finds a file in nested directories', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-tool-utils-'));
    tempDirs.push(rootDir);

    const nestedDir = path.join(rootDir, 'a', 'b', 'c');
    fs.mkdirSync(nestedDir, { recursive: true });
    const filePath = path.join(nestedDir, 'uv.exe');
    fs.writeFileSync(filePath, '');

    assert.strictEqual(findFileRecursively(rootDir, 'uv.exe'), filePath);
  });

  it('returns undefined when the file is missing', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-tool-utils-missing-'));
    tempDirs.push(rootDir);

    fs.mkdirSync(path.join(rootDir, 'a', 'b'), { recursive: true });

    assert.strictEqual(findFileRecursively(rootDir, 'probe-rs.exe'), undefined);
  });
});
