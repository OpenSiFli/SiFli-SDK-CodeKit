import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { spawn } from 'child_process';
import { LogService } from './logService';
import { ConfigService } from './configService';

/**
 * 在 Windows 上自动下载并配置 MinGit 以提供 git 命令。
 */
export class MinGitService {
  private static instance: MinGitService;
  private context?: vscode.ExtensionContext;
  private logService: LogService;
  private configService: ConfigService;
  private gitCmdDir?: string;

  private static readonly MINGIT_URLS = {
    x64: 'https://downloads.sifli.com/dl/sifli-sdk/MinGit/MinGit-2.52.0-64-bit.zip',
    arm64: 'https://downloads.sifli.com/dl/sifli-sdk/MinGit/MinGit-2.52.0-arm64.zip',
    ia32: 'https://downloads.sifli.com/dl/sifli-sdk/MinGit/MinGit-2.52.0-32-bit.zip'
  };

  private constructor() {
    this.logService = LogService.getInstance();
    this.configService = ConfigService.getInstance();
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
    return this.gitCmdDir;
  }

  /**
   * 确保 git 可用；若系统无 git 则下载 MinGit 并将 cmd 目录加入 PATH。
   */
  public async ensureGitAvailable(): Promise<void> {
    if (process.platform !== 'win32') {
      return;
    }

    // 如果系统已有 git 则直接返回
    if (await this.isGitOnPath()) {
      this.logService.info('System git found on PATH.');
      return;
    }

    const installDir = this.getInstallDir();
    if (!installDir) {
      this.logService.error('Cannot determine MinGit install directory (missing extension context).');
      return;
    }

    const cmdDir = path.join(installDir, 'cmd');
    const gitExe = path.join(cmdDir, 'git.exe');

    // 已安装的 MinGit
    if (fs.existsSync(gitExe)) {
      this.logService.info(`Using existing MinGit at ${gitExe}`);
      this.injectPath(cmdDir);
      this.gitCmdDir = cmdDir;
      return;
    }

    // 未安装则下载
    try {
      vscode.window.showInformationMessage('未检测到系统 Git，正在下载 MinGit...');
      await this.downloadAndExtractMinGit(installDir);
      if (fs.existsSync(gitExe)) {
        this.injectPath(cmdDir);
        this.gitCmdDir = cmdDir;
        this.logService.info(`MinGit installed at ${cmdDir}`);
      } else {
        throw new Error('MinGit git.exe not found after extraction.');
      }
    } catch (error) {
      this.logService.error('Failed to install MinGit:', error);
      vscode.window.showErrorMessage(`安装 MinGit 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getInstallDir(): string | undefined {
    if (!this.context) {
      return undefined;
    }
    return path.join(this.context.globalStorageUri.fsPath, 'mingit');
  }

  private async isGitOnPath(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('git', ['--version'], { stdio: 'ignore' });
      proc.on('close', (code) => resolve(code === 0));
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

  private async downloadAndExtractMinGit(installDir: string): Promise<void> {
    const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'ia32' : 'x64';
    const downloadUrl = MinGitService.MINGIT_URLS[arch];
    const zipPath = path.join(installDir, 'mingit.zip');

    // 确保目录存在
    fs.mkdirSync(installDir, { recursive: true });

    this.logService.info(`Downloading MinGit (${arch}) from ${downloadUrl} to ${zipPath}`);

    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream'
    });

    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(zipPath);
      response.data.on('error', reject);
      writer.on('error', reject);
      writer.on('finish', resolve);
      response.data.pipe(writer);
    });

    // 解压
    const command = `Expand-Archive -Path "${zipPath}" -DestinationPath "${installDir}" -Force`;
    this.logService.info(`Extracting MinGit to ${installDir}`);
    await this.runPowerShellCommand(command);

    // 清理
    try {
      fs.unlinkSync(zipPath);
    } catch {
      // ignore cleanup errors
    }
  }

  private async runPowerShellCommand(command: string): Promise<void> {
    const configuredPath = this.configService.config.powershellPath;
    const powershellPath = configuredPath && configuredPath.trim() !== '' ? configuredPath : 'powershell.exe';

    return new Promise((resolve, reject) => {
      const proc = spawn(
        powershellPath,
        ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { windowsHide: true }
      );

      let stderrOutput = '';
      proc.stderr?.on('data', (data: Buffer) => {
        stderrOutput += data.toString();
      });

      proc.on('error', (err: Error) => reject(err));
      proc.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`PowerShell exited with code ${code}${stderrOutput ? `: ${stderrOutput.trim()}` : ''}`));
        }
      });
    });
  }

  private injectPath(cmdDir: string): void {
    const current = process.env.PATH || '';
    if (!current.toLowerCase().includes(cmdDir.toLowerCase())) {
      process.env.PATH = `${cmdDir};${current}`;
      this.logService.info(`Injected MinGit PATH: ${cmdDir}`);
    }
  }
}
