import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach } from 'mocha';
import { describe, it } from 'mocha';
import { buildExportedEnvironmentPythonSnippet, parseExportedEnvironmentFile } from '../utils/exportedEnvironmentUtils';

describe('exportedEnvironmentUtils', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds a Python snippet that writes exported environment JSON to a file', () => {
    const outputPath = 'C:\\Temp\\sdk env.json';
    const snippet = buildExportedEnvironmentPythonSnippet(outputPath);

    assert.ok(snippet.includes("'C:\\\\Temp\\\\sdk env.json'"));
    assert.ok(snippet.includes("data['CODEKIT_EXPORTED_PYTHON']=sys.executable"));
    assert.ok(snippet.includes(", 'w', encoding='utf-8')"));
    assert.ok(!snippet.includes('"'));
    assert.ok(!snippet.includes('print('));
  });

  it('escapes apostrophes in the Python output path literal', () => {
    const outputPath = "C:\\Temp\\SDK's env\\environment.json";
    const snippet = buildExportedEnvironmentPythonSnippet(outputPath);

    assert.ok(snippet.includes("'C:\\\\Temp\\\\SDK\\'s env\\\\environment.json'"));
  });

  it('parses exported environment JSON from a file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codekit-env-test-'));
    tempDirs.push(dir);
    const outputPath = path.join(dir, 'environment.json');
    fs.writeFileSync(
      outputPath,
      JSON.stringify({
        CODEKIT_EXPORTED_PYTHON: 'C:\\Python\\python.exe',
        SIFLI_SDK: 'D:\\SiFli-SDK',
      })
    );

    assert.deepStrictEqual(parseExportedEnvironmentFile(outputPath), {
      CODEKIT_EXPORTED_PYTHON: 'C:\\Python\\python.exe',
      SIFLI_SDK: 'D:\\SiFli-SDK',
    });
  });
});
