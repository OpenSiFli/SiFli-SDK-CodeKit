import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, it } from 'mocha';
import { HCPU_SUBFOLDER, PTAB_JSON_FILE, PTAB_YAML_FILE } from '../constants';
import { findBoardPartitionTableFile, isValidBoardDirectory } from '../utils/boardDiscoveryUtils';

const tempRoots: string[] = [];

function createTempBoard(boardName: string): string {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sifli-board-discovery-'));
  tempRoots.push(tempRoot);

  const boardPath = path.join(tempRoot, boardName);
  fs.mkdirSync(boardPath, { recursive: true });
  return boardPath;
}

function createHcpuDirectory(boardPath: string): void {
  fs.mkdirSync(path.join(boardPath, HCPU_SUBFOLDER), { recursive: true });
}

function createPartitionTable(boardPath: string, fileName: string): void {
  fs.writeFileSync(path.join(boardPath, fileName), '{}', 'utf8');
}

describe('boardDiscoveryUtils', () => {
  afterEach(() => {
    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  });

  it('accepts board directories with ptab.json', () => {
    const boardPath = createTempBoard('json-board');
    createHcpuDirectory(boardPath);
    createPartitionTable(boardPath, PTAB_JSON_FILE);

    assert.strictEqual(isValidBoardDirectory(boardPath), true);
    assert.strictEqual(findBoardPartitionTableFile(boardPath), path.join(boardPath, PTAB_JSON_FILE));
  });

  it('accepts board directories with ptab.yaml', () => {
    const boardPath = createTempBoard('sf32lb52-lcd_n16r8');
    createHcpuDirectory(boardPath);
    createPartitionTable(boardPath, PTAB_YAML_FILE);

    assert.strictEqual(isValidBoardDirectory(boardPath), true);
    assert.strictEqual(findBoardPartitionTableFile(boardPath), path.join(boardPath, PTAB_YAML_FILE));
  });

  it('prefers ptab.yaml over ptab.json when both exist', () => {
    const boardPath = createTempBoard('yaml-preferred-board');
    createHcpuDirectory(boardPath);
    createPartitionTable(boardPath, PTAB_JSON_FILE);
    createPartitionTable(boardPath, PTAB_YAML_FILE);

    assert.strictEqual(findBoardPartitionTableFile(boardPath), path.join(boardPath, PTAB_YAML_FILE));
  });

  it('rejects directories without hcpu', () => {
    const boardPath = createTempBoard('missing-hcpu-board');
    createPartitionTable(boardPath, PTAB_YAML_FILE);

    assert.strictEqual(isValidBoardDirectory(boardPath), false);
  });

  it('rejects directories without a supported partition table', () => {
    const boardPath = createTempBoard('missing-ptab-board');
    createHcpuDirectory(boardPath);

    assert.strictEqual(isValidBoardDirectory(boardPath), false);
    assert.strictEqual(findBoardPartitionTableFile(boardPath), null);
  });
});
