import * as assert from 'assert';
import * as path from 'path';
import { describe, it } from 'mocha';
import { Board } from '../types';
import { buildBoardSearchArg, getBoardSearchPath } from '../utils/boardSearchPathUtils';

function absolutePath(...segments: string[]): string {
  const root = process.platform === 'win32' ? 'C:\\' : path.sep;
  return path.join(root, ...segments);
}

function createBoard(type: Board['type'], boardPath: string): Board {
  return {
    name: 'board-under-test',
    path: boardPath,
    type,
  };
}

describe('boardSearchPathUtils', () => {
  const workspaceRoot = absolutePath('workspace');
  const projectRootEntry = path.join(workspaceRoot, 'project');
  const projectHcpuEntry = path.join(workspaceRoot, 'project', 'hcpu');
  const projectBoardsRoot = path.join(workspaceRoot, 'boards');
  const customBoardsRoot = path.join(workspaceRoot, 'custom_boards');

  it('does not emit board_search_path for sdk boards', () => {
    const board = createBoard('sdk', path.join(workspaceRoot, 'sdk', 'customer', 'boards', 'board_a'));

    assert.strictEqual(getBoardSearchPath(board, projectRootEntry, workspaceRoot), null);
    assert.strictEqual(buildBoardSearchArg(board, projectRootEntry, workspaceRoot), '');
  });

  it('resolves project-local boards relative to the project root entry', () => {
    const board = createBoard('project_local', path.join(projectBoardsRoot, 'board_a'));
    const expectedSearchPath = path.join('..', 'boards');

    assert.strictEqual(getBoardSearchPath(board, projectRootEntry, workspaceRoot), expectedSearchPath);
    assert.strictEqual(
      buildBoardSearchArg(board, projectRootEntry, workspaceRoot),
      ` --board_search_path="${expectedSearchPath}"`
    );
  });

  it('resolves project-local boards relative to the hcpu project entry', () => {
    const board = createBoard('project_local', path.join(projectBoardsRoot, 'board_a'));
    const expectedSearchPath = path.join('..', '..', 'boards');

    assert.strictEqual(getBoardSearchPath(board, projectHcpuEntry, workspaceRoot), expectedSearchPath);
    assert.strictEqual(
      buildBoardSearchArg(board, projectHcpuEntry, workspaceRoot),
      ` --board_search_path="${expectedSearchPath}"`
    );
  });

  it('points custom boards to the custom search root instead of the board directory itself', () => {
    const board = createBoard('custom', path.join(customBoardsRoot, 'board_a'));

    assert.strictEqual(
      getBoardSearchPath(board, projectHcpuEntry, workspaceRoot),
      path.join('..', '..', 'custom_boards')
    );
  });

  it('resolves relative custom board paths from the workspace root', () => {
    const board = createBoard('custom', path.join('custom_boards', 'board_a'));

    assert.strictEqual(
      getBoardSearchPath(board, projectHcpuEntry, workspaceRoot),
      path.join('..', '..', 'custom_boards')
    );
  });

  it('collapses matching search roots to dot', () => {
    const board = createBoard('custom', path.join(projectHcpuEntry, 'board_a'));

    assert.strictEqual(getBoardSearchPath(board, projectHcpuEntry, workspaceRoot), '.');
    assert.strictEqual(buildBoardSearchArg(board, projectHcpuEntry, workspaceRoot), ' --board_search_path="."');
  });
});
