import * as path from 'path';

export function resolveMainMapPath(workspaceRoot: string, buildFolder: string): string {
  return path.join(workspaceRoot, buildFolder, 'main.map');
}
