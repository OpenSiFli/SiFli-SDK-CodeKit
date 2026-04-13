import * as fs from 'fs';
import * as path from 'path';

export function findFileRecursively(rootDir: string, fileName: string): string | undefined {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isFile() && entry.name === fileName) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const nested = findFileRecursively(fullPath, fileName);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}
