import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, it } from 'mocha';
import { resolveVueWebviewCssFiles } from '../utils/vueWebviewAssets';

describe('vueWebviewAssets', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function createDistWithCssFiles(cssFiles: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-webview-assets-'));
    tempDirs.push(dir);
    const assetsDir = path.join(dir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    for (const cssFile of cssFiles) {
      fs.writeFileSync(path.join(assetsDir, cssFile), '');
    }
    return dir;
  }

  it('loads the default entry css and shared xterm css for the main Vue webview', () => {
    const distPath = createDistWithCssFiles(['index.css', 'buildLogs.css', 'xterm.css']);

    assert.deepStrictEqual(resolveVueWebviewCssFiles(distPath), ['assets/index.css', 'assets/xterm.css']);
  });

  it('keeps unrelated entry css out of the main Vue webview', () => {
    const distPath = createDistWithCssFiles(['index.css', 'buildLogs.css', 'memoryMap.css', 'xterm.css']);

    assert.deepStrictEqual(resolveVueWebviewCssFiles(distPath), ['assets/index.css', 'assets/xterm.css']);
  });

  it('uses explicit css files for the build logs webview', () => {
    const distPath = createDistWithCssFiles(['index.css', 'buildLogs.css', 'xterm.css']);

    assert.deepStrictEqual(resolveVueWebviewCssFiles(distPath, 'assets/buildLogs.js', ['assets/buildLogs.css']), [
      'assets/buildLogs.css',
    ]);
  });
});
