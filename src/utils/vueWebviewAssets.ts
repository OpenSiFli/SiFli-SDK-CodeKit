import * as fs from 'fs';
import * as path from 'path';

export function resolveVueWebviewCssFiles(
  vueDistPath: string,
  scriptFile = 'assets/index.js',
  cssFiles?: string[]
): string[] {
  if (cssFiles) {
    return cssFiles;
  }

  const normalizedScriptFile = scriptFile.replace(/\\/g, '/');
  const scriptDir = path.posix.dirname(normalizedScriptFile);
  const scriptName = path.posix.basename(normalizedScriptFile, path.posix.extname(normalizedScriptFile));
  const entryCssFile = path.posix.join(scriptDir, `${scriptName}.css`);
  const entryCssPath = path.join(vueDistPath, ...entryCssFile.split('/'));

  return fs.existsSync(entryCssPath) ? [entryCssFile] : [];
}
