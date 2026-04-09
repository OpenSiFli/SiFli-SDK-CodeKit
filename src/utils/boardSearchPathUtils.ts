import * as path from 'path';
import { Board } from '../types';

function resolveWorkspacePath(targetPath: string, workspaceRoot?: string): string {
  if (path.isAbsolute(targetPath) || !workspaceRoot) {
    return path.normalize(targetPath);
  }
  return path.resolve(workspaceRoot, targetPath);
}

export function getBoardSearchPath(board: Board, projectEntryPath: string, workspaceRoot?: string): string | null {
  if (board.type === 'sdk') {
    return null;
  }

  const normalizedProjectEntryPath = resolveWorkspacePath(projectEntryPath, workspaceRoot);
  const normalizedBoardPath = resolveWorkspacePath(board.path, workspaceRoot);
  const searchRoot = path.dirname(normalizedBoardPath);
  const relativeSearchRoot = path.relative(normalizedProjectEntryPath, searchRoot);

  return relativeSearchRoot === '' ? '.' : relativeSearchRoot;
}

export function buildBoardSearchArg(board: Board, projectEntryPath: string, workspaceRoot?: string): string {
  const boardSearchPath = getBoardSearchPath(board, projectEntryPath, workspaceRoot);
  return boardSearchPath ? ` --board_search_path="${boardSearchPath}"` : '';
}
