import * as fs from 'fs';
import * as path from 'path';

export type PowerShellKind = 'pwsh' | 'powershell';

export interface ResolvedPowerShellExecutable {
  executablePath: string;
  kind: PowerShellKind;
  source: 'configured' | 'auto-pwsh' | 'auto-powershell';
}

interface ResolvePowerShellOptions {
  platform?: NodeJS.Platform;
  envPath?: string;
  envPathExt?: string;
}

export function resolvePowerShellExecutable(
  configuredPath: string | undefined,
  options?: ResolvePowerShellOptions
): ResolvedPowerShellExecutable {
  const configured = configuredPath?.trim();
  if (configured) {
    return {
      executablePath: configured,
      kind: inferPowerShellKind(configured),
      source: 'configured',
    };
  }

  const platform = options?.platform ?? process.platform;
  if (platform === 'win32') {
    const detectedPwsh = findExecutableInPathSync('pwsh', options);
    if (detectedPwsh) {
      return {
        executablePath: detectedPwsh,
        kind: 'pwsh',
        source: 'auto-pwsh',
      };
    }
  }

  return {
    executablePath: 'powershell.exe',
    kind: 'powershell',
    source: 'auto-powershell',
  };
}

export function inferPowerShellKind(executablePath: string): PowerShellKind {
  const baseName = path.win32.basename(executablePath).toLowerCase();
  const normalized = baseName.replace(/\.(exe|cmd|bat|com)$/i, '');
  return normalized === 'pwsh' ? 'pwsh' : 'powershell';
}

export function formatInstallScriptFailure(
  message: string,
  powerShellKind: PowerShellKind | undefined,
  upgradeHint: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === 'win32' && powerShellKind === 'powershell') {
    return `${message}\n${upgradeHint}`;
  }
  return message;
}

function findExecutableInPathSync(executableName: string, options?: ResolvePowerShellOptions): string | null {
  const envPath = options?.envPath ?? process.env.PATH ?? process.env.Path ?? '';
  const envPathExt = options?.envPathExt ?? process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM';
  const delimiter = (options?.platform ?? process.platform) === 'win32' ? ';' : path.delimiter;
  const pathDirs = envPath
    .split(delimiter)
    .map(dir => dir.replace(/"/g, '').trim())
    .filter(Boolean);
  const extensions = getExecutableExtensions(executableName, envPathExt);

  for (const dir of pathDirs) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${executableName}${extension}`);
      if (isFile(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function getExecutableExtensions(executableName: string, envPathExt: string): string[] {
  if (path.extname(executableName)) {
    return [''];
  }

  const extensions = envPathExt
    .split(';')
    .map(ext => ext.trim())
    .filter(Boolean)
    .map(ext => (ext.startsWith('.') ? ext : `.${ext}`));

  return extensions.length > 0 ? extensions : ['.exe'];
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
