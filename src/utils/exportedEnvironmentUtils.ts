import * as fs from 'fs';

export function buildExportedEnvironmentPythonSnippet(outputPath: string): string {
  return [
    'import json, os, sys',
    'data=dict(os.environ)',
    'data["CODEKIT_EXPORTED_PYTHON"]=sys.executable',
    `fh=open(${JSON.stringify(outputPath)}, "w", encoding="utf-8")`,
    'fh.write(json.dumps(data, ensure_ascii=False))',
    'fh.close()',
  ].join('; ');
}

export function parseExportedEnvironmentFile(filePath: string): NodeJS.ProcessEnv {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').trim()) as NodeJS.ProcessEnv;
}
