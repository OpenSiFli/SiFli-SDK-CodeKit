import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LogService } from './logService';
import { ConfigService } from './configService';
import { ManagedToolSupport } from './managedToolSupport';
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
  private readonly toolSupport: ManagedToolSupport;
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
    this.toolSupport = new ManagedToolSupport(this.logService, this.configService);
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
    this.toolSupport.prepareManagedEnvironment('probe-rs', this.getManagedExecutableDir());
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
    const executableName = process.platform === 'win32' ? 'probe-rs.exe' : 'probe-rs';
    const found = this.toolSupport.resolveExecutablePath(installDir, { recursiveFileName: executableName });
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
    const output = await this.toolSupport.runCommand(executablePath, ['-V'], { timeoutMs: 5000 });
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

    const downloadUrl = `${ProbeRsService.DOWNLOAD_BASE_URL}/${asset.fileName}`;
    const executablePath = await this.toolSupport.installManagedArchiveTool({
      toolLabel: 'probe-rs',
      installDir,
      asset: {
        fileName: asset.fileName,
        downloadUrl,
        archiveType: asset.archiveType,
      },
      installingTitle: vscode.l10n.t('Installing probe-rs...'),
      downloadingMessage: vscode.l10n.t('Downloading bundled probe-rs...'),
      extractingMessage: vscode.l10n.t('Extracting probe-rs...'),
      missingExecutableMessage: vscode.l10n.t('Failed to locate probe-rs executable after extraction.'),
      successMessage: vscode.l10n.t('SiFli probe-rs installed successfully.'),
      failureMessage: error =>
        vscode.l10n.t('Failed to install SiFli probe-rs: {0}', error instanceof Error ? error.message : String(error)),
      resolveExecutablePath: () => this.getManagedExecutablePath(),
      afterResolveExecutable: async resolvedExecutablePath => {
        if (process.platform !== 'win32') {
          try {
            fs.chmodSync(resolvedExecutablePath, 0o755);
          } catch (error) {
            this.logService.warn('Failed to set executable permissions for probe-rs', error);
          }
        }

        const versionInfo = await this.validateExecutableVersion(resolvedExecutablePath);
        if (!versionInfo.isSifliBuild) {
          throw new Error(
            vscode.l10n.t(
              'Downloaded probe-rs is not a SiFli build. Version output: {0}',
              versionInfo.rawOutput || 'N/A'
            )
          );
        }
      },
    });

    this.managedExecutablePath = executablePath;
    return executablePath;
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
    return this.toolSupport.injectProcessPath(this.getManagedExecutableDir(), 'probe-rs');
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
