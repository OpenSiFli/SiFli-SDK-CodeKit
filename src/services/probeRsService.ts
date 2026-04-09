import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { spawn } from 'child_process';
import { LogService } from './logService';
import { ConfigService } from './configService';
import { findExecutable } from '../probe-rs/utils';

type SupportedPlatform = 'win32' | 'darwin' | 'linux';
type SupportedArch = 'x64' | 'arm64';

interface ProbeRsVersionInfo {
  executablePath: string;
  rawOutput: string;
  isSifliBuild: boolean;
  source: 'managed' | 'path';
}

interface ProbeRsAssetInfo {
  fileName: string;
  archiveType: 'zip' | 'tar.xz';
}

export class ProbeRsService {
  private static instance: ProbeRsService;

  private context?: vscode.ExtensionContext;
  private readonly logService: LogService;
  private readonly configService: ConfigService;
  private installPromise?: Promise<string>;
  private managedExecutablePath?: string;

  private static readonly DOWNLOAD_BASE_URL =
    'https://downloads.sifli.com/github_assets/OpenSiFli/probe-rs/releases/latest/download';

  private static readonly ASSET_MAP: Record<SupportedPlatform, Partial<Record<SupportedArch, ProbeRsAssetInfo>>> = {
    win32: {
      x64: {
        fileName: 'probe-rs-tools-x86_64-pc-windows-msvc.zip',
        archiveType: 'zip',
      },
    },
    darwin: {
      x64: {
        fileName: 'probe-rs-tools-x86_64-apple-darwin.tar.xz',
        archiveType: 'tar.xz',
      },
      arm64: {
        fileName: 'probe-rs-tools-aarch64-apple-darwin.tar.xz',
        archiveType: 'tar.xz',
      },
    },
    linux: {
      x64: {
        fileName: 'probe-rs-tools-x86_64-unknown-linux-gnu.tar.xz',
        archiveType: 'tar.xz',
      },
    },
  };

  private constructor() {
    this.logService = LogService.getInstance();
    this.configService = ConfigService.getInstance();
  }

  public static getInstance(): ProbeRsService {
    if (!ProbeRsService.instance) {
      ProbeRsService.instance = new ProbeRsService();
    }
    return ProbeRsService.instance;
  }

  public setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  public prepareManagedEnvironment(): void {
    const injected = this.injectPath();
    if (injected) {
      this.logService.info(`Managed probe-rs PATH prepared: ${injected}`);
    } else {
      this.logService.info('Managed probe-rs is not installed yet; startup PATH injection skipped.');
    }
  }

  public async checkAndPromptForCompatibleProbeRsOnStartup(): Promise<void> {
    if (this.hasExplicitDebuggerExecutableOverride()) {
      this.logService.info('Skipping startup probe-rs auto-check because sifli-probe-rs.debuggerExecutable is set.');
      return;
    }

    this.logService.info('Checking auto-detected probe-rs compatibility on startup.');
    const executablePath = await this.ensureCompatibleProbeRsAvailable();
    if (executablePath) {
      this.logService.info(`Compatible SiFli probe-rs is ready: ${executablePath}`);
    } else {
      this.logService.warn('No compatible SiFli probe-rs was prepared during startup.');
    }
  }

  public getManagedExecutablePath(): string | undefined {
    if (this.managedExecutablePath && fs.existsSync(this.managedExecutablePath)) {
      return this.managedExecutablePath;
    }

    const installDir = this.getInstallDir();
    if (!installDir || !fs.existsSync(installDir)) {
      return undefined;
    }

    const executableName = process.platform === 'win32' ? 'probe-rs.exe' : 'probe-rs';
    const found = this.findFileRecursively(installDir, executableName);
    if (!found) {
      return undefined;
    }

    this.managedExecutablePath = found;
    return found;
  }

  public getManagedExecutableDir(): string | undefined {
    const executablePath = this.getManagedExecutablePath();
    return executablePath ? path.dirname(executablePath) : undefined;
  }

  public async ensureCompatibleProbeRsAvailable(): Promise<string | undefined> {
    const resolution = await this.resolveAutoExecutable();
    if (resolution?.isSifliBuild) {
      return resolution.executablePath;
    }

    const installLabel = vscode.l10n.t('Install');
    const response = await vscode.window.showWarningMessage(
      vscode.l10n.t('No compatible SiFli probe-rs was detected. Do you want to install it now?'),
      installLabel
    );

    if (response !== installLabel) {
      return undefined;
    }

    await this.installManagedProbeRs();
    const installed = await this.resolveAutoExecutable();
    if (installed?.isSifliBuild) {
      return installed.executablePath;
    }

    return undefined;
  }

  public async validateExecutableVersion(executablePath: string): Promise<ProbeRsVersionInfo> {
    const output = await this.runCommand(executablePath, ['-V'], { timeoutMs: 5000 });
    const rawOutput = `${output.stdout}\n${output.stderr}`.trim();

    return {
      executablePath,
      rawOutput,
      isSifliBuild: rawOutput.includes('-sifli'),
      source: 'path',
    };
  }

  private async resolveAutoExecutable(): Promise<ProbeRsVersionInfo | undefined> {
    const managedExecutable = this.getManagedExecutablePath();
    if (managedExecutable) {
      this.logService.info(`Checking managed probe-rs: ${managedExecutable}`);
      try {
        const versionInfo = await this.validateExecutableVersion(managedExecutable);
        versionInfo.source = 'managed';
        this.logService.info(`Managed probe-rs version output: ${versionInfo.rawOutput || 'N/A'}`);
        if (versionInfo.isSifliBuild) {
          this.injectPath();
        } else {
          this.logService.warn(`Managed probe-rs is not a SiFli build: ${versionInfo.rawOutput || 'N/A'}`);
        }
        return versionInfo;
      } catch (error) {
        this.logService.warn('Failed to validate managed probe-rs executable', error);
        return {
          executablePath: managedExecutable,
          rawOutput: '',
          isSifliBuild: false,
          source: 'managed',
        };
      }
    }

    const executable = await findExecutable('probe-rs');
    if (!executable) {
      this.logService.warn('No probe-rs executable was found in the managed location or on PATH.');
      return undefined;
    }

    this.logService.info(`Checking PATH probe-rs: ${executable}`);
    try {
      const versionInfo = await this.validateExecutableVersion(executable);
      versionInfo.source = 'path';
      this.logService.info(`PATH probe-rs version output: ${versionInfo.rawOutput || 'N/A'}`);
      if (!versionInfo.isSifliBuild) {
        this.logService.warn(`PATH probe-rs is not a SiFli build: ${versionInfo.rawOutput || 'N/A'}`);
      }
      return versionInfo;
    } catch (error) {
      this.logService.warn('Failed to validate PATH probe-rs executable', error);
      return {
        executablePath: executable,
        rawOutput: '',
        isSifliBuild: false,
        source: 'path',
      };
    }
  }

  private async installManagedProbeRs(): Promise<string> {
    if (this.installPromise) {
      return this.installPromise;
    }

    this.installPromise = this.installManagedProbeRsInternal();
    try {
      return await this.installPromise;
    } finally {
      this.installPromise = undefined;
    }
  }

  private async installManagedProbeRsInternal(): Promise<string> {
    const asset = this.getAssetInfo();
    if (!asset) {
      const platform = os.platform();
      const arch = os.arch();
      const message = vscode.l10n.t(
        'Automatic probe-rs installation is not supported on platform {0} ({1}).',
        platform,
        arch
      );
      this.logService.error(message);
      vscode.window.showErrorMessage(message);
      throw new Error(message);
    }

    const installDir = this.getInstallDir();
    if (!installDir) {
      const message = vscode.l10n.t('Cannot determine probe-rs install path. Extension context is not initialized.');
      this.logService.error(message);
      vscode.window.showErrorMessage(message);
      throw new Error(message);
    }

    const archivePath = path.join(installDir, asset.fileName);
    const downloadUrl = `${ProbeRsService.DOWNLOAD_BASE_URL}/${asset.fileName}`;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: vscode.l10n.t('Installing probe-rs...'),
          cancellable: false,
        },
        async progress => {
          fs.rmSync(installDir, { recursive: true, force: true });
          fs.mkdirSync(installDir, { recursive: true });

          progress.report({ message: vscode.l10n.t('Downloading bundled probe-rs...') });
          await this.downloadArchive(downloadUrl, archivePath, progress);

          progress.report({ message: vscode.l10n.t('Extracting probe-rs...') });
          await this.extractArchive(archivePath, installDir, asset.archiveType);

          try {
            fs.unlinkSync(archivePath);
          } catch {
            this.logService.warn(`Failed to remove temporary probe-rs archive: ${archivePath}`);
          }
        }
      );

      const executablePath = this.getManagedExecutablePath();
      if (!executablePath) {
        throw new Error(vscode.l10n.t('Failed to locate probe-rs executable after extraction.'));
      }

      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(executablePath, 0o755);
        } catch (error) {
          this.logService.warn('Failed to set executable permissions for probe-rs', error);
        }
      }

      const versionInfo = await this.validateExecutableVersion(executablePath);
      if (!versionInfo.isSifliBuild) {
        throw new Error(
          vscode.l10n.t('Downloaded probe-rs is not a SiFli build. Version output: {0}', versionInfo.rawOutput || 'N/A')
        );
      }

      this.managedExecutablePath = executablePath;
      this.injectPath();
      vscode.window.showInformationMessage(vscode.l10n.t('SiFli probe-rs installed successfully.'));
      return executablePath;
    } catch (error) {
      this.logService.error('Failed to install bundled probe-rs', error);
      if (fs.existsSync(archivePath)) {
        try {
          fs.unlinkSync(archivePath);
        } catch {
          this.logService.warn(`Failed to clean up probe-rs archive after error: ${archivePath}`);
        }
      }

      const message = vscode.l10n.t(
        'Failed to install SiFli probe-rs: {0}',
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

    return path.join(this.context.globalStorageUri.fsPath, 'probe-rs', `${os.platform()}-${os.arch()}`);
  }

  private getAssetInfo(): ProbeRsAssetInfo | undefined {
    const platform = os.platform();
    const arch = os.arch();

    if (!this.isSupportedPlatform(platform)) {
      return undefined;
    }

    if (!this.isSupportedArch(arch)) {
      return undefined;
    }

    return ProbeRsService.ASSET_MAP[platform][arch];
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
    this.logService.info(`Injected probe-rs PATH: ${executableDir}`);
    return executableDir;
  }

  private async downloadArchive(
    url: string,
    destination: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<void> {
    this.logService.info(`Downloading bundled probe-rs from ${url} to ${destination}`);

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

  private async extractArchive(archivePath: string, destination: string, archiveType: 'zip' | 'tar.xz'): Promise<void> {
    if (archiveType === 'zip') {
      const command = `Expand-Archive -Path "${archivePath}" -DestinationPath "${destination}" -Force`;
      await this.runPowerShellCommand(command);
      return;
    }

    await this.runCommand('tar', ['-xJf', archivePath, '-C', destination], { timeoutMs: 60_000 });
  }

  private async runPowerShellCommand(command: string): Promise<void> {
    const configuredPath = this.configService.config.powershellPath;
    const powershellPath = configuredPath && configuredPath.trim() !== '' ? configuredPath : 'powershell.exe';

    await this.runCommand(
      powershellPath,
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

  private isSupportedPlatform(platform: string): platform is SupportedPlatform {
    return platform === 'win32' || platform === 'darwin' || platform === 'linux';
  }

  private isSupportedArch(arch: string): arch is SupportedArch {
    return arch === 'x64' || arch === 'arm64';
  }

  private hasExplicitDebuggerExecutableOverride(): boolean {
    const configuration = vscode.workspace.getConfiguration('sifli-probe-rs');
    const configuredPath = configuration.get<string>('debuggerExecutable');
    return !!configuredPath && configuredPath.trim() !== '';
  }
}
