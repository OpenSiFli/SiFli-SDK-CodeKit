import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, it } from 'mocha';
import { resolveBuildLogLinks } from '../utils/buildLogLinks';

describe('buildLogLinks', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('resolves project-relative file and line links', () => {
    const root = createTempDir();
    const target = createFile(root, 'src/main.c');

    const links = resolveBuildLogLinks('src/main.c:12: error: failed', {
      searchRoots: [root],
    });

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].path, target);
    assert.strictEqual(links[0].line, 12);
    assert.strictEqual(links[0].column, undefined);
    assert.strictEqual(links[0].start, 0);
    assert.strictEqual(links[0].end, 'src/main.c:12'.length);
  });

  it('resolves parent-relative links with columns from the task working directory', () => {
    const workspace = createTempDir();
    const cwd = path.join(workspace, 'project');
    fs.mkdirSync(cwd, { recursive: true });
    const target = createFile(workspace, 'drv/foo.c');

    const links = resolveBuildLogLinks('../drv/foo.c:8:3: warning: failed', {
      searchRoots: [cwd],
    });

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].path, target);
    assert.strictEqual(links[0].line, 8);
    assert.strictEqual(links[0].column, 3);
  });

  it('resolves absolute file links', () => {
    const root = createTempDir();
    const target = createFile(root, 'absolute.c');

    const links = resolveBuildLogLinks(`${target}:99:5: note`, {
      searchRoots: [],
    });

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].path, target);
    assert.strictEqual(links[0].line, 99);
    assert.strictEqual(links[0].column, 5);
  });

  it('resolves bare absolute file paths with a default line', () => {
    const root = createTempDir();
    const target = createFile(root, 'build/ptab.effective.yaml');

    const links = resolveBuildLogLinks(`ptab ${target}`, {
      searchRoots: [],
    });

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].path, target);
    assert.strictEqual(links[0].line, 1);
    assert.strictEqual(links[0].column, undefined);
    assert.strictEqual(links[0].start, 'ptab '.length);
    assert.strictEqual(links[0].end, `ptab ${target}`.length);
  });

  it('does not duplicate bare path links for file and line locations', () => {
    const root = createTempDir();
    const target = createFile(root, 'src/main.c');

    const links = resolveBuildLogLinks(`${target}:99:5: note`, {
      searchRoots: [],
    });

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].path, target);
    assert.strictEqual(links[0].line, 99);
    assert.strictEqual(links[0].column, 5);
  });

  it('resolves Windows absolute file links', () => {
    const target = 'C:\\work\\src\\main.c';

    const links = resolveBuildLogLinks(`${target}:12:3: error`, {
      platform: 'win32',
      fileExists: filePath => filePath === target,
    });

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].path, target);
    assert.strictEqual(links[0].line, 12);
    assert.strictEqual(links[0].column, 3);
  });

  it('does not link locations that cannot be resolved to an existing file', () => {
    const root = createTempDir();

    const links = resolveBuildLogLinks('missing/file.c:12: error', {
      searchRoots: [root],
    });

    assert.deepStrictEqual(links, []);
  });

  it('does not link bare paths that resolve to directories', () => {
    const root = createTempDir();
    const directory = path.join(root, 'build_dir');
    fs.mkdirSync(directory);

    const links = resolveBuildLogLinks(`build_dir ${directory}`, {
      searchRoots: [],
    });

    assert.deepStrictEqual(links, []);
  });

  function createTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codekit-build-links-'));
    tempDirs.push(dir);
    return dir;
  }

  function createFile(root: string, relativePath: string): string {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '');
    return filePath;
  }
});
