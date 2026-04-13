import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { spawn } from 'child_process';
import { ConfigService } from './configService';
import { LogService } from './logService';
import { resolvePowerShellExecutable } from '../utils/powerShellUtils';
import { MANAGED_UV_VERSION, getManagedUvAssetInfo } from '../utils/uvAssetUtils';

export class UvService {
  private static instance: UvService;

  private context?: vscode.ExtensionContext;
  private readonly logService: LogService;
  private readonly configService: ConfigService;
  private installPromise?: Promise<string>;
  private managedExecutablePath?: string;

  private constructor() {
    this.logService = LogService.getInstance();
    this.configService = ConfigService.getInstance();
  }

  public static getInstance(): UvService {
    if (!UvService.instance) {
      UvService.instance = new UvService();
    }
    return UvService.instance;
  }

  public setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  public prepareManagedEnvironment(): void {
    const injected = this.injectPath();
    if (injected) {
      this.logService.info(`Managed uv PATH prepared: ${injected}`);
    } else {
      this.logService.info('Managed uv is not installed yet; startup PATH injection skipped.');
    }
  }

  public async ensureUvAvailable(): Promise<string> {
    const executablePath = this.getManagedExecutablePath();
    if (executablePath) {
      this.managedExecutablePath = executablePath;
      this.injectPath();
      return executablePath;
    }

    if (this.installPromise) {
      return this.installPromise;
    }

    this.installPromise = this.installManagedUvInternal();
    try {
      return await this.installPromise;
    } finally {
      this.installPromise = undefined;
    }
  }

  public getManagedExecutableDir(): string | undefined {
    const executablePath = this.getManagedExecutablePath();
    return executablePath ? path.dirname(executablePath) : undefined;
  }

  private async installManagedUvInternal(): Promise<string> {
    const asset = getManagedUvAssetInfo(os.platform(), os.arch());
    if (!asset) {
      const platform = os.platform();
      const arch = os.arch();
      const message = vscode.l10n.t(
        'Automatic uv installation is not supported on platform {0} ({1}).',
        platform,
        arch
      );
      this.logService.error(message);
      vscode.window.showErrorMessage(message);
      throw new Error(message);
    }

    const installDir = this.getInstallDir();
    if (!installDir) {
      const message = vscode.l10n.t('Cannot determine uv install path. Extension context is not initialized.');
      this.logService.error(message);
      vscode.window.showErrorMessage(message);
      throw new Error(message);
    }

    const archivePath = path.join(installDir, asset.fileName);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: vscode.l10n.t('Installing uv...'),
          cancellable: false,
        },
        async progress => {
          fs.rmSync(installDir, { recursive: true, force: true });
          fs.mkdirSync(installDir, { recursive: true });

          progress.report({ message: vscode.l10n.t('Downloading bundled uv...') });
          await this.downloadArchive(asset.downloadUrl, archivePath, progress);

          progress.report({ message: vscode.l10n.t('Extracting uv...') });
          await this.extractArchive(archivePath, installDir, asset.archiveType);

          try {
            fs.unlinkSync(archivePath);
          } catch {
            this.logService.warn(`Failed to remove temporary uv archive: ${archivePath}`);
          }
        }
      );

      const executablePath = this.getManagedExecutablePath();
      if (!executablePath) {
        throw new Error(vscode.l10n.t('Failed to locate uv executable after extraction.'));
      }

      this.managedExecutablePath = executablePath;
      this.injectPath();
      vscode.window.showInformationMessage(vscode.l10n.t('SiFli uv installed successfully.'));
      return executablePath;
    } catch (error) {
      this.logService.error('Failed to install bundled uv', error);
      if (fs.existsSync(archivePath)) {
        try {
          fs.unlinkSync(archivePath);
        } catch {
          this.logService.warn(`Failed to clean up uv archive after error: ${archivePath}`);
        }
      }

      const message = vscode.l10n.t(
        'Failed to install SiFli uv: {0}',
        error instanceof Error ? error.message : String(error)
      );
      vscode.window.showErrorMessage(message);
      throw error;
    }
  }

  private getInstallDir(): string | undefined {
    if (!this.context) {
      return undefined;
    }

    return path.join(this.context.globalStorageUri.fsPath, 'uv', MANAGED_UV_VERSION, `${os.platform()}-${os.arch()}`);
  }

  private getManagedExecutablePath(): string | undefined {
    if (this.managedExecutablePath && fs.existsSync(this.managedExecutablePath)) {
      return this.managedExecutablePath;
    }

    const installDir = this.getInstallDir();
    if (!installDir || !fs.existsSync(installDir)) {
      return undefined;
    }

    const found = this.findFileRecursively(installDir, 'uv.exe');
    if (!found) {
      return undefined;
    }

    this.managedExecutablePath = found;
    return found;
  }

  private injectPath(): string | undefined {
    const executableDir = this.getManagedExecutableDir();
    if (!executableDir) {
      return undefined;
    }

    const currentPath = process.env.PATH || '';
    const entries = currentPath.split(path.delimiter).filter(Boolean);
    if (entries.some(entry => entry.toLowerCase() === executableDir.toLowerCase())) {
      return executableDir;
    }

    process.env.PATH = `${executableDir}${path.delimiter}${currentPath}`;
    this.logService.info(`Injected uv PATH: ${executableDir}`);
    return executableDir;
  }

  private async downloadArchive(
    url: string,
    destination: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<void> {
    this.logService.info(`Downloading bundled uv from ${url} to ${destination}`);

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

  private async extractArchive(archivePath: string, destination: string, archiveType: 'zip'): Promise<void> {
    if (archiveType !== 'zip') {
      throw new Error(`Unsupported uv archive type: ${archiveType}`);
    }

    const command = `Expand-Archive -Path "${archivePath}" -DestinationPath "${destination}" -Force`;
    await this.runPowerShellCommand(command);
  }

  private async runPowerShellCommand(command: string): Promise<void> {
    const powerShell = resolvePowerShellExecutable(this.configService.config.powershellPath);

    await this.runCommand(
      powerShell.executablePath,
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeoutMs: 60_000 }
    );
  }

  private async runCommand(
    command: string,
    args: string[],
    options?: { timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true });
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

  private findFileRecursively(rootDir: string, fileName: string): string | undefined {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isFile() && entry.name === fileName) {
        return fullPath;
      }
      if (entry.isDirectory()) {
        const nested = this.findFileRecursively(fullPath, fileName);
        if (nested) {
          return nested;
        }
      }
    }
    return undefined;
  }
}
