import * as assert from 'assert';
import * as path from 'path';
import { describe, it } from 'mocha';
import {
  buildClangdArguments,
  buildCodeKitClangdConfigBlock,
  getDefaultSifliToolsRoot,
  readWorkspaceSettingJsonc,
  resolveToolchainFromSifliEnvState,
  upsertCodeKitClangdConfig,
  upsertWorkspaceSettingJsonc,
} from '../utils/clangdConfigUtils';

describe('clangdConfigUtils', () => {
  const sdkPath = '/workspace/SiFli-SDK';
  const installRoot = '/Users/test/.sifli';
  const gccPath = `${installRoot}/tools/arm-none-eabi-gcc/14.2.1/bin/arm-none-eabi-gcc`;
  const gxxPath = `${installRoot}/tools/arm-none-eabi-gcc/14.2.1/bin/arm-none-eabi-g++`;
  const queryDriver = `${installRoot}/tools/arm-none-eabi-gcc/14.2.1/bin/arm-none-eabi-*`;

  it('resolves GCC paths from schema v2 sifli-sdk-env state', () => {
    const stateDoc = {
      schema_version: 2,
      repos: {
        [sdkPath]: {
          profiles: {
            default: {
              selected_env_key: 'default|abc',
            },
          },
        },
      },
      envs: {
        'default|abc': {
          tools: {
            'arm-none-eabi-gcc': '14.2.1',
          },
          install_root: installRoot,
        },
      },
    };

    const result = resolveToolchainFromSifliEnvState({
      stateDoc,
      sdkPath,
      executableExists: () => true,
    });

    assert.deepStrictEqual(result.warnings, []);
    assert.strictEqual(result.version, '14.2.1');
    assert.strictEqual(result.queryDriver, queryDriver);
    assert.deepStrictEqual(result.compilerPaths, {
      c: gccPath,
      cxx: gxxPath,
    });
  });

  it('resolves GCC paths from legacy schema v1 installed state', () => {
    const stateDoc = {
      schema_version: 1,
      repos: {
        [sdkPath]: {
          profiles: {
            default: {
              installed: {
                tools: {
                  'arm-none-eabi-gcc': '14.2.1',
                },
                install_root: installRoot,
              },
            },
          },
        },
      },
    };

    const result = resolveToolchainFromSifliEnvState({
      stateDoc,
      sdkPath,
      executableExists: () => true,
    });

    assert.deepStrictEqual(result.warnings, []);
    assert.strictEqual(result.queryDriver, queryDriver);
    assert.strictEqual(result.compilerPaths.c, gccPath);
  });

  it('warns and skips query-driver when recorded compiler executables are missing', () => {
    const stateDoc = {
      schema_version: 2,
      repos: {
        [sdkPath]: {
          profiles: {
            default: {
              selected_env_key: 'default|abc',
            },
          },
        },
      },
      envs: {
        'default|abc': {
          tools: {
            'arm-none-eabi-gcc': '14.2.1',
          },
          install_root: installRoot,
        },
      },
    };

    const result = resolveToolchainFromSifliEnvState({
      stateDoc,
      sdkPath,
      executableExists: filePath => filePath !== gxxPath,
    });

    assert.strictEqual(result.queryDriver, undefined);
    assert.deepStrictEqual(result.compilerPaths, {});
    assert.match(result.warnings.join('\n'), /missing executable/);
  });

  it('builds clangd arguments while preserving user-owned query drivers', () => {
    const args = buildClangdArguments({
      existingArguments: [
        '--compile-commands-dir=/old/build',
        `--query-driver=/custom/bin/*,${installRoot}/tools/arm-none-eabi-gcc/13.2.1/bin/arm-none-eabi-*`,
        '--clang-tidy',
        '--background-index=false',
        '--pch-storage=memory',
      ],
      compileCommandsDir: '${workspaceFolder}/project/build_board_hcpu',
      queryDriver,
    });

    assert.deepStrictEqual(args, [
      '--clang-tidy',
      '--enable-config',
      '--background-index',
      '--pch-storage=disk',
      `--query-driver=/custom/bin/*,${queryDriver}`,
      '--compile-commands-dir=${workspaceFolder}/project/build_board_hcpu',
    ]);
  });

  it('creates and replaces the CodeKit .clangd marker block', () => {
    const firstBlock = buildCodeKitClangdConfigBlock({
      compilationDatabase: 'project/build_old_hcpu',
      compilerPaths: {
        c: gccPath,
      },
    });
    const secondBlock = buildCodeKitClangdConfigBlock({
      compilationDatabase: 'project/build_new_hcpu',
      compilerPaths: {
        c: gccPath,
        cxx: gxxPath,
      },
    });

    const existing = `CompileFlags:\n  Add: [-Wall]\n\n${firstBlock}`;
    const updated = upsertCodeKitClangdConfig(existing, secondBlock);

    assert.match(updated, /CompileFlags:\n  Add: \[-Wall\]/);
    assert.doesNotMatch(updated, /project\/build_old_hcpu/);
    assert.match(updated, /project\/build_new_hcpu/);
    assert.match(updated, /arm-none-eabi-g\+\+/);
  });

  it('uses configured or environment tools roots before falling back to home', () => {
    assert.strictEqual(
      getDefaultSifliToolsRoot({
        configuredToolsPath: '/configured',
        envToolsPath: '/env',
        homeDir: '/home/user',
      }),
      '/configured'
    );
    assert.strictEqual(
      getDefaultSifliToolsRoot({
        envToolsPath: '/env',
        homeDir: '/home/user',
      }),
      '/env'
    );
    assert.strictEqual(getDefaultSifliToolsRoot({ homeDir: '/home/user' }), path.join('/home/user', '.sifli'));
  });

  it('inserts clangd.arguments into workspace settings JSON', () => {
    const updated = upsertWorkspaceSettingJsonc('{\n  "editor.tabSize": 2\n}\n', 'clangd.arguments', [
      '--enable-config',
      '--background-index',
    ]);

    assert.strictEqual(
      updated,
      '{\n  "editor.tabSize": 2,\n  "clangd.arguments": [\n    "--enable-config",\n    "--background-index"\n  ]\n}\n'
    );
  });

  it('replaces clangd.arguments in workspace settings JSONC without dropping other settings', () => {
    const updated = upsertWorkspaceSettingJsonc(
      '{\n  // user setting\n  "clangd.arguments": [\n    "--old"\n  ],\n  "files.exclude": {}\n}\n',
      'clangd.arguments',
      ['--new']
    );

    assert.strictEqual(
      updated,
      '{\n  // user setting\n  "clangd.arguments": [\n    "--new"\n  ],\n  "files.exclude": {}\n}\n'
    );
  });

  it('reads clangd.arguments from workspace settings JSONC', () => {
    const value = readWorkspaceSettingJsonc(
      '{\n  // user setting\n  "clangd.arguments": [\n    "--old"\n  ]\n}\n',
      'clangd.arguments'
    );

    assert.deepStrictEqual(value, ['--old']);
  });
});
