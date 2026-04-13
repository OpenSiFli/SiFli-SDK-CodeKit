import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigService } from './configService';
import { LogService } from './logService';
import { ManagedToolSupport } from './managedToolSupport';
import { MANAGED_UV_VERSION, getManagedUvAssetInfo } from '../utils/uvAssetUtils';

export class UvService {
  private static instance: UvService;

  private context?: vscode.ExtensionContext;
  private readonly logService: LogService;
  private readonly configService: ConfigService;
  private readonly toolSupport: ManagedToolSupport;
  private installPromise?: Promise<string>;
  private managedExecutablePath?: string;

  private constructor() {
    this.logService = LogService.getInstance();
    this.configService = ConfigService.getInstance();
    this.toolSupport = new ManagedToolSupport(this.logService, this.configService);
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
    this.toolSupport.prepareManagedEnvironment('uv', this.getManagedExecutableDir());
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
      const executablePath = await this.toolSupport.installManagedArchiveTool({
        toolLabel: 'uv',
        installDir,
        asset,
        installingTitle: vscode.l10n.t('Installing uv...'),
        downloadingMessage: vscode.l10n.t('Downloading bundled uv...'),
        extractingMessage: vscode.l10n.t('Extracting uv...'),
        missingExecutableMessage: vscode.l10n.t('Failed to locate uv executable after extraction.'),
        successMessage: vscode.l10n.t('SiFli uv installed successfully.'),
        failureMessage: error =>
          vscode.l10n.t('Failed to install SiFli uv: {0}', error instanceof Error ? error.message : String(error)),
        resolveExecutablePath: () => this.getManagedExecutablePath(),
      });
      this.managedExecutablePath = executablePath;
      return executablePath;
    } catch (error) {
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
    const found = this.toolSupport.resolveExecutablePath(installDir, { recursiveFileName: 'uv.exe' });
    if (!found) {
      return undefined;
    }

    this.managedExecutablePath = found;
    return found;
  }

  private injectPath(): string | undefined {
    const executableDir = this.getManagedExecutableDir();
    return this.toolSupport.injectProcessPath(executableDir, 'uv');
  }
}
