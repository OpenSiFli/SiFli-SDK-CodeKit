import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { LogService } from './logService';
import { ConfigService } from './configService';
import { ManagedToolSupport } from './managedToolSupport';

/**
 * 在 Windows 上自动下载并配置 MinGit 以提供 git 命令。
 */
export class MinGitService {
  private static instance: MinGitService;
  private context?: vscode.ExtensionContext;
  private readonly logService: LogService;
  private readonly configService: ConfigService;
  private readonly toolSupport: ManagedToolSupport;
  private installPromise?: Promise<string>;
  private gitCmdDir?: string;

  private static readonly MINGIT_URLS = {
    x64: 'https://downloads.sifli.com/dl/sifli-sdk/MinGit/MinGit-2.52.0-64-bit.zip',
    arm64: 'https://downloads.sifli.com/dl/sifli-sdk/MinGit/MinGit-2.52.0-arm64.zip',
    ia32: 'https://downloads.sifli.com/dl/sifli-sdk/MinGit/MinGit-2.52.0-32-bit.zip',
  };

  private constructor() {
    this.logService = LogService.getInstance();
    this.configService = ConfigService.getInstance();
    this.toolSupport = new ManagedToolSupport(this.logService, this.configService);
  }

  public static getInstance(): MinGitService {
    if (!MinGitService.instance) {
      MinGitService.instance = new MinGitService();
    }
    return MinGitService.instance;
  }

  public setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  /**
   * 返回 MinGit cmd 目录（若尚未安装则返回 undefined）
   */
  public getGitCmdDir(): string | undefined {
    if (this.gitCmdDir && fs.existsSync(path.join(this.gitCmdDir, 'git.exe'))) {
      return this.gitCmdDir;
    }

    const installDir = this.getInstallDir();
    const gitExe = this.toolSupport.resolveExecutablePath(installDir, {
      exactRelativePath: path.join('cmd', 'git.exe'),
    });
    if (!gitExe) {
      return undefined;
    }

    this.gitCmdDir = path.dirname(gitExe);
    return this.gitCmdDir;
  }

  /**
   * 确保 git 可用；若系统无 git 则下载 MinGit 并将 cmd 目录加入 PATH。
   */
  public async ensureGitAvailable(): Promise<void> {
    if (process.platform !== 'win32') {
      return;
    }

    if (await this.isGitOnPath()) {
      this.logService.info('System git found on PATH.');
      return;
    }

    const existingCmdDir = this.getGitCmdDir();
    if (existingCmdDir) {
      this.logService.info(`Using existing MinGit at ${path.join(existingCmdDir, 'git.exe')}`);
      this.injectPath(existingCmdDir);
      return;
    }

    const installDir = this.getInstallDir();
    if (!installDir) {
      this.logService.error('Cannot determine MinGit install directory (missing extension context).');
      return;
    }

    try {
      vscode.window.showInformationMessage(vscode.l10n.t('System Git not found. Downloading MinGit...'));
      const gitExe = await this.installManagedMinGit(installDir);
      const cmdDir = path.dirname(gitExe);
      this.injectPath(cmdDir);
      this.gitCmdDir = cmdDir;
      this.logService.info(`MinGit installed at ${cmdDir}`);
    } catch (error) {
      this.logService.error('Failed to install MinGit:', error);
    }
  }

  private getInstallDir(): string | undefined {
    if (!this.context) {
      return undefined;
    }
    return path.join(this.context.globalStorageUri.fsPath, 'mingit');
  }

  private async installManagedMinGit(installDir: string): Promise<string> {
    if (this.installPromise) {
      return this.installPromise;
    }

    this.installPromise = this.installManagedMinGitInternal(installDir);
    try {
      return await this.installPromise;
    } finally {
      this.installPromise = undefined;
    }
  }

  private async installManagedMinGitInternal(installDir: string): Promise<string> {
    const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'ia32' : 'x64';
    const downloadUrl = MinGitService.MINGIT_URLS[arch];

    return this.toolSupport.installManagedArchiveTool({
      toolLabel: 'MinGit',
      installDir,
      asset: {
        fileName: 'mingit.zip',
        downloadUrl,
        archiveType: 'zip',
      },
      installingTitle: vscode.l10n.t('Installing MinGit...'),
      downloadingMessage: vscode.l10n.t('Downloading bundled MinGit...'),
      extractingMessage: vscode.l10n.t('Extracting MinGit...'),
      missingExecutableMessage: 'MinGit git.exe not found after extraction.',
      failureMessage: error =>
        vscode.l10n.t('Failed to install MinGit: {0}', error instanceof Error ? error.message : String(error)),
      resolveExecutablePath: () =>
        this.toolSupport.resolveExecutablePath(installDir, { exactRelativePath: path.join('cmd', 'git.exe') }),
      injectPathOnSuccess: false,
    });
  }

  private async isGitOnPath(): Promise<boolean> {
    return new Promise(resolve => {
      const proc = spawn('git', ['--version'], { stdio: 'ignore' });
      proc.on('close', code => resolve(code === 0));
      proc.on('error', () => resolve(false));
      setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // ignore
        }
        resolve(false);
      }, 4000);
    });
  }

  private injectPath(cmdDir: string): void {
    this.toolSupport.injectProcessPath(cmdDir, 'MinGit');
  }
}
