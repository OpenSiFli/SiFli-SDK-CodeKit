import * as path from 'path';
import { promises as fs } from 'fs';

/**
 * Try to locate an executable in the current PATH.
 */
async function findExecutable(executableName: string): Promise<string | null> {
  const envPath = process.env.PATH || '';
  const envExt = process.platform === 'win32' ? process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM' : '';
  const pathDirs = envPath.replace(/["]+/g, '').split(path.delimiter).filter(Boolean);
  const extensions = envExt ? envExt.split(';') : [''];
  const candidates = pathDirs.flatMap((dir) => extensions.map((ext) => path.join(dir, executableName + ext)));

  for (const candidate of candidates) {
    try {
      return await checkFileExists(candidate);
    } catch {
      // Continue searching remaining candidates
    }
  }
  return null;
}

async function checkFileExists(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    throw new Error('Not a file');
  }
  return filePath;
}

export async function probeRsInstalled(): Promise<boolean> {
  const executableName = process.platform === 'win32' ? 'probe-rs.exe' : 'probe-rs';
  return (await findExecutable(executableName)) !== null;
}
