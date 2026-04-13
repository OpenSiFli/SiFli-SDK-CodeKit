import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { spawn } from 'child_process';
import { ConfigService } from './configService';
import { LogService } from './logService';
import { findFileRecursively } from '../utils/managedToolUtils';
import { resolvePowerShellExecutable } from '../utils/powerShellUtils';

export interface ManagedToolAsset {
  fileName: string;
  downloadUrl: string;
  archiveType: 'zip' | 'tar.xz';
}

export interface ManagedToolInstallOptions {
  toolLabel: string;
  installDir: string;
  asset: ManagedToolAsset;
  installingTitle: string;
  downloadingMessage: string;
  extractingMessage: string;
  missingExecutableMessage: string;
  failureMessage: (error: unknown) => string;
  resolveExecutablePath: () => string | undefined;
  successMessage?: string;
  clearInstallDir?: boolean;
  injectPathOnSuccess?: boolean;
  afterExtract?: (context: {
    installDir: string;
    archivePath: string;
    progress: vscode.Progress<{ message?: string; increment?: number }>;
  }) => Promise<void>;
  afterResolveExecutable?: (executablePath: string) => Promise<void>;
}

export class ManagedToolSupport {
  public constructor(
    private readonly logService: LogService,
    private readonly configService: ConfigService
  ) {}

  public prepareManagedEnvironment(toolLabel: string, executableDir: string | undefined): string | undefined {
    const injected = this.injectProcessPath(executableDir, toolLabel);
    if (injected) {
      this.logService.info(`Managed ${toolLabel} PATH prepared: ${injected}`);
    } else {
      this.logService.info(`Managed ${toolLabel} is not installed yet; startup PATH injection skipped.`);
    }
    return injected;
  }

  public injectProcessPath(executableDir: string | undefined, toolLabel: string): string | undefined {
    if (!executableDir) {
      return undefined;
    }

    const currentPath = process.env.PATH || process.env.Path || '';
    const entries = currentPath.split(path.delimiter).filter(Boolean);
    const alreadyPresent = entries.some(entry =>
      process.platform === 'win32' ? entry.toLowerCase() === executableDir.toLowerCase() : entry === executableDir
    );
    if (alreadyPresent) {
      return executableDir;
    }

    const nextPath = `${executableDir}${path.delimiter}${currentPath}`;
    process.env.PATH = nextPath;
    if (Object.prototype.hasOwnProperty.call(process.env, 'Path')) {
      process.env.Path = nextPath;
    }
    this.logService.info(`Injected ${toolLabel} PATH: ${executableDir}`);
    return executableDir;
  }

  public resolveExecutablePath(
    installDir: string | undefined,
    options: { exactRelativePath?: string; recursiveFileName?: string }
  ): string | undefined {
    if (!installDir || !fs.existsSync(installDir)) {
      return undefined;
    }

    if (options.exactRelativePath) {
      const exactPath = path.join(installDir, options.exactRelativePath);
      if (fs.existsSync(exactPath)) {
        return exactPath;
      }
    }

    if (options.recursiveFileName) {
      return findFileRecursively(installDir, options.recursiveFileName);
    }

    return undefined;
  }

  public async installManagedArchiveTool(options: ManagedToolInstallOptions): Promise<string> {
    const archivePath = path.join(options.installDir, options.asset.fileName);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: options.installingTitle,
          cancellable: false,
        },
        async progress => {
          if (options.clearInstallDir !== false) {
            fs.rmSync(options.installDir, { recursive: true, force: true });
          }
          fs.mkdirSync(options.installDir, { recursive: true });

          progress.report({ message: options.downloadingMessage });
          await this.downloadArchive(options.asset.downloadUrl, archivePath, progress, options.toolLabel);

          progress.report({ message: options.extractingMessage });
          await this.extractArchive(archivePath, options.installDir, options.asset.archiveType);

          try {
            fs.unlinkSync(archivePath);
          } catch {
            this.logService.warn(`Failed to remove temporary ${options.toolLabel} archive: ${archivePath}`);
          }

          await options.afterExtract?.({
            installDir: options.installDir,
            archivePath,
            progress,
          });
        }
      );

      const executablePath = options.resolveExecutablePath();
      if (!executablePath) {
        throw new Error(options.missingExecutableMessage);
      }

      await options.afterResolveExecutable?.(executablePath);

      if (options.injectPathOnSuccess !== false) {
        this.injectProcessPath(path.dirname(executablePath), options.toolLabel);
      }

      if (options.successMessage) {
        vscode.window.showInformationMessage(options.successMessage);
      }

      return executablePath;
    } catch (error) {
      this.logService.error(`Failed to install bundled ${options.toolLabel}`, error);
      if (fs.existsSync(archivePath)) {
        try {
          fs.unlinkSync(archivePath);
        } catch {
          this.logService.warn(`Failed to clean up ${options.toolLabel} archive after error: ${archivePath}`);
        }
      }

      vscode.window.showErrorMessage(options.failureMessage(error));
      throw error;
    }
  }

  public async downloadArchive(
    url: string,
    destination: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    toolLabel: string
  ): Promise<void> {
    this.logService.info(`Downloading bundled ${toolLabel} from ${url} to ${destination}`);

    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
    });

    const totalLengthHeader = response.headers['content-length'];
    const totalLength = totalLengthHeader ? Number(totalLengthHeader) : undefined;
    let downloadedLength = 0;

    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(destination);

      response.data.on('data', (chunk: Buffer) => {
        downloadedLength += chunk.length;
        if (totalLength && Number.isFinite(totalLength) && totalLength > 0) {
          const percentage = Math.min(100, Math.round((downloadedLength / totalLength) * 100));
          progress.report({ message: vscode.l10n.t('Downloaded {0}%', String(percentage)) });
        }
      });

      response.data.on('error', reject);
      writer.on('error', reject);
      writer.on('finish', resolve);
      response.data.pipe(writer);
    });
  }

  public async extractArchive(archivePath: string, destination: string, archiveType: 'zip' | 'tar.xz'): Promise<void> {
    if (archiveType === 'zip') {
      const command = `Expand-Archive -Path "${archivePath}" -DestinationPath "${destination}" -Force`;
      await this.runPowerShellCommand(command);
      return;
    }

    await this.runCommand('tar', ['-xJf', archivePath, '-C', destination], { timeoutMs: 60_000 });
  }

  public async runPowerShellCommand(command: string): Promise<void> {
    const powerShell = resolvePowerShellExecutable(this.configService.config.powershellPath);

    await this.runCommand(
      powerShell.executablePath,
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeoutMs: 60_000 }
    );
  }

  public async runCommand(
    command: string,
    args: string[],
    options?: { timeoutMs?: number; cwd?: string; env?: NodeJS.ProcessEnv; windowsHide?: boolean }
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options?.cwd,
        env: options?.env,
        windowsHide: options?.windowsHide ?? true,
      });
      const timeoutMs = options?.timeoutMs ?? 10_000;
      let stdout = '';
      let stderr = '';
      let settled = false;

      const finalize = (handler: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        handler();
      };

      const timeout = setTimeout(() => {
        finalize(() => {
          try {
            child.kill();
          } catch {
            // ignore kill failures
          }
          reject(new Error(`Command timed out: ${command} ${args.join(' ')}`));
        });
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', error => {
        finalize(() => reject(error));
      });

      child.on('close', code => {
        finalize(() => {
          if (code === 0) {
            resolve({ stdout, stderr });
          } else {
            reject(new Error(stderr.trim() || stdout.trim() || `Command exited with code ${String(code)}`));
          }
        });
      });
    });
  }
}
