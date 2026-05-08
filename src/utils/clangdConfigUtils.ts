import * as os from 'os';
import * as path from 'path';
import { applyEdits, findNodeAtLocation, getNodeValue, modify, parseTree } from 'jsonc-parser';

export type CompilerPaths = {
  c?: string;
  cxx?: string;
};

export type ClangdToolchainResolution = {
  version?: string;
  installRoot?: string;
  queryDriver?: string;
  compilerPaths: CompilerPaths;
  warnings: string[];
};

export type BuildClangdArgumentsOptions = {
  existingArguments: unknown;
  compileCommandsDir: string;
  queryDriver?: string;
};

export type BuildClangdConfigOptions = {
  compilationDatabase: string;
  compilerPaths: CompilerPaths;
};

const DEFAULT_PROFILE = 'default';
const GCC_TOOL_NAME = 'arm-none-eabi-gcc';
const GXX_TOOL_NAME = 'arm-none-eabi-g++';
const GCC_PACKAGE_NAME = 'arm-none-eabi-gcc';
const CLANGD_MARKER_BEGIN = '# BEGIN SiFli CodeKit clangd config';
const CLANGD_MARKER_END = '# END SiFli CodeKit clangd config';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringProperty(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizePathForCompare(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function findMatchingRecord(records: Record<string, unknown>, keyPath: string): Record<string, unknown> | undefined {
  const normalizedKeyPath = normalizePathForCompare(keyPath);
  for (const [candidatePath, value] of Object.entries(records)) {
    if (normalizePathForCompare(candidatePath) === normalizedKeyPath && isRecord(value)) {
      return value;
    }
  }

  return undefined;
}

function getProfileState(
  stateDoc: Record<string, unknown>,
  sdkPath: string,
  profile: string
): Record<string, unknown> | undefined {
  const repos = stateDoc.repos;
  if (!isRecord(repos)) {
    return undefined;
  }

  const repoEntry = findMatchingRecord(repos, sdkPath);
  const profiles = repoEntry?.profiles;
  if (!isRecord(profiles)) {
    return undefined;
  }

  const profileState = profiles[profile];
  return isRecord(profileState) ? profileState : undefined;
}

function getSchemaV2EnvState(
  stateDoc: Record<string, unknown>,
  profileState: Record<string, unknown>
): Record<string, unknown> | undefined {
  const selectedEnvKey = getStringProperty(profileState, 'selected_env_key');
  if (!selectedEnvKey) {
    return undefined;
  }

  const envs = stateDoc.envs;
  if (!isRecord(envs)) {
    return undefined;
  }

  const envState = envs[selectedEnvKey];
  return isRecord(envState) ? envState : undefined;
}

function getSchemaV1EnvState(profileState: Record<string, unknown>): Record<string, unknown> | undefined {
  const installed = profileState.installed;
  return isRecord(installed) ? installed : undefined;
}

function getToolVersion(envState: Record<string, unknown>): string | undefined {
  const tools = envState.tools;
  if (!isRecord(tools)) {
    return undefined;
  }

  return getStringProperty(tools, GCC_PACKAGE_NAME);
}

function executableName(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function toClangdPath(value: string): string {
  return value.split(path.sep).join('/');
}

function buildCompilerPaths(installRoot: string, version: string): CompilerPaths {
  const binDir = path.join(installRoot, 'tools', GCC_PACKAGE_NAME, version, 'bin');
  return {
    c: path.join(binDir, executableName(GCC_TOOL_NAME)),
    cxx: path.join(binDir, executableName(GXX_TOOL_NAME)),
  };
}

export function getDefaultSifliToolsRoot(options: {
  configuredToolsPath?: string;
  envToolsPath?: string;
  homeDir?: string;
}): string {
  const configuredToolsPath = options.configuredToolsPath?.trim();
  if (configuredToolsPath) {
    return configuredToolsPath;
  }

  const envToolsPath = options.envToolsPath?.trim();
  if (envToolsPath) {
    return envToolsPath;
  }

  return path.join(options.homeDir ?? os.homedir(), '.sifli');
}

export function resolveToolchainFromSifliEnvState(options: {
  stateDoc: unknown;
  sdkPath: string;
  profile?: string;
  executableExists?: (filePath: string) => boolean;
}): ClangdToolchainResolution {
  const warnings: string[] = [];
  const emptyResult = { compilerPaths: {}, warnings };
  const profile = options.profile ?? DEFAULT_PROFILE;

  if (!isRecord(options.stateDoc)) {
    warnings.push('sifli-sdk-env.json is not a JSON object.');
    return emptyResult;
  }

  const profileState = getProfileState(options.stateDoc, options.sdkPath, profile);
  if (!profileState) {
    warnings.push(`No '${profile}' profile was found for SDK path ${options.sdkPath}.`);
    return emptyResult;
  }

  const schemaVersion =
    typeof options.stateDoc.schema_version === 'number' ? options.stateDoc.schema_version : undefined;
  const envState =
    schemaVersion === 2
      ? getSchemaV2EnvState(options.stateDoc, profileState)
      : (getSchemaV1EnvState(profileState) ?? getSchemaV2EnvState(options.stateDoc, profileState));

  if (!envState) {
    warnings.push(`No installed SDK environment was found for profile '${profile}'.`);
    return emptyResult;
  }

  const installRoot = getStringProperty(envState, 'install_root');
  if (!installRoot) {
    warnings.push('SDK environment state does not record install_root.');
    return emptyResult;
  }

  const version = getToolVersion(envState);
  if (!version) {
    warnings.push(`SDK environment state does not record ${GCC_PACKAGE_NAME} version.`);
    return {
      installRoot,
      compilerPaths: {},
      warnings,
    };
  }

  const compilerPaths = buildCompilerPaths(installRoot, version);
  const exists = options.executableExists;
  const missingPaths = [compilerPaths.c, compilerPaths.cxx].filter((filePath): filePath is string => {
    return !!filePath && !!exists && !exists(filePath);
  });
  if (missingPaths.length > 0) {
    warnings.push(`Recorded ${GCC_PACKAGE_NAME} ${version} is missing executable(s): ${missingPaths.join(', ')}.`);
    return {
      version,
      installRoot,
      compilerPaths: {},
      warnings,
    };
  }

  const binDir = path.dirname(compilerPaths.c ?? '');
  return {
    version,
    installRoot,
    queryDriver: `${toClangdPath(binDir)}/arm-none-eabi-*`,
    compilerPaths: {
      c: compilerPaths.c ? toClangdPath(compilerPaths.c) : undefined,
      cxx: compilerPaths.cxx ? toClangdPath(compilerPaths.cxx) : undefined,
    },
    warnings,
  };
}

function splitQueryDriverValue(argument: string): string[] {
  const value = argument.slice('--query-driver='.length);
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function isManagedSifliQueryDriver(value: string): boolean {
  const normalized = value.replace(/\\/g, '/');
  return /\/tools\/arm-none-eabi-gcc\/[^/]+\/bin\/arm-none-eabi-\*$/.test(normalized);
}

function pushUnique(target: string[], values: string[]): void {
  for (const value of values) {
    if (!target.includes(value)) {
      target.push(value);
    }
  }
}

export function buildClangdArguments(options: BuildClangdArgumentsOptions): string[] {
  const existingArguments = Array.isArray(options.existingArguments)
    ? options.existingArguments.filter((value): value is string => typeof value === 'string')
    : [];
  const nextArguments: string[] = [];
  const preservedQueryDrivers: string[] = [];

  for (const argument of existingArguments) {
    if (argument.startsWith('--compile-commands-dir=')) {
      continue;
    }

    if (argument.startsWith('--query-driver=')) {
      pushUnique(
        preservedQueryDrivers,
        splitQueryDriverValue(argument).filter(value => !isManagedSifliQueryDriver(value))
      );
      continue;
    }

    if (
      argument === '--enable-config' ||
      argument === '--background-index' ||
      argument.startsWith('--background-index=') ||
      argument.startsWith('--pch-storage=')
    ) {
      continue;
    }

    nextArguments.push(argument);
  }

  nextArguments.push('--enable-config', '--background-index', '--pch-storage=disk');

  const queryDrivers = [...preservedQueryDrivers];
  if (options.queryDriver) {
    pushUnique(queryDrivers, [options.queryDriver]);
  }
  if (queryDrivers.length > 0) {
    nextArguments.push(`--query-driver=${queryDrivers.join(',')}`);
  }

  nextArguments.push(`--compile-commands-dir=${options.compileCommandsDir}`);
  return nextArguments;
}

function quoteYamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildCodeKitClangdConfigBlock(options: BuildClangdConfigOptions): string {
  const lines = [
    CLANGD_MARKER_BEGIN,
    'CompileFlags:',
    `  CompilationDatabase: ${quoteYamlString(options.compilationDatabase)}`,
    '',
    'Index:',
    '  Background: Build',
    '',
    'Completion:',
    '  HeaderInsertion: Never',
    '',
    'Diagnostics:',
    '  ClangTidy: false',
  ];

  if (options.compilerPaths.c) {
    lines.push(
      '---',
      'If:',
      "  PathMatch: '.*\\.(c|h|s|S)$'",
      'CompileFlags:',
      `  Compiler: ${quoteYamlString(options.compilerPaths.c)}`
    );
  }

  if (options.compilerPaths.cxx) {
    lines.push(
      '---',
      'If:',
      "  PathMatch: '.*\\.(cc|cpp|cxx|hh|hpp|hxx)$'",
      'CompileFlags:',
      `  Compiler: ${quoteYamlString(options.compilerPaths.cxx)}`
    );
  }

  lines.push(CLANGD_MARKER_END);
  return `${lines.join('\n')}\n`;
}

export function upsertCodeKitClangdConfig(existingContent: string | undefined, block: string): string {
  const normalizedBlock = block.endsWith('\n') ? block : `${block}\n`;
  if (!existingContent || existingContent.trim().length === 0) {
    return normalizedBlock;
  }

  const beginIndex = existingContent.indexOf(CLANGD_MARKER_BEGIN);
  const endIndex = existingContent.indexOf(CLANGD_MARKER_END);
  if (beginIndex !== -1 && endIndex !== -1 && endIndex >= beginIndex) {
    const replacementEnd = endIndex + CLANGD_MARKER_END.length;
    const suffix = existingContent.slice(replacementEnd).replace(/^\r?\n/, '');
    return `${existingContent.slice(0, beginIndex)}${normalizedBlock}${suffix}`;
  }

  const trimmedExisting = existingContent.replace(/\s+$/, '');
  return `${trimmedExisting}\n\n${normalizedBlock}`;
}

export function upsertWorkspaceSettingJsonc(existingContent: string | undefined, key: string, value: unknown): string {
  const content = existingContent && existingContent.trim().length > 0 ? existingContent : '{\n}\n';
  const edits = modify(content, [key], value, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
      eol: '\n',
      insertFinalNewline: true,
    },
  });
  return applyEdits(content, edits);
}

export function readWorkspaceSettingJsonc(existingContent: string | undefined, key: string): unknown {
  if (!existingContent) {
    return undefined;
  }

  const tree = parseTree(existingContent, undefined, { allowTrailingComma: true });
  if (!tree) {
    return undefined;
  }

  const node = findNodeAtLocation(tree, [key]);
  return node ? getNodeValue(node) : undefined;
}
