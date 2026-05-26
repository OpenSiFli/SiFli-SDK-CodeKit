import * as fs from 'fs';
import * as path from 'path';
import { HCPU_SUBFOLDER, SUPPORTED_PTAB_FILES } from '../constants';

export function findBoardPartitionTableFile(boardPath: string): string | null {
  for (const fileName of SUPPORTED_PTAB_FILES) {
    const ptabPath = path.join(boardPath, fileName);
    if (isFile(ptabPath)) {
      return ptabPath;
    }
  }

  return null;
}

export function isValidBoardDirectory(boardPath: string): boolean {
  const hcpuPath = path.join(boardPath, HCPU_SUBFOLDER);
  if (!isDirectory(hcpuPath)) {
    return false;
  }

  return findBoardPartitionTableFile(boardPath) !== null;
}

function isDirectory(targetPath: string): boolean {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(targetPath: string): boolean {
  try {
    return fs.statSync(targetPath).isFile();
  } catch {
    return false;
  }
}
