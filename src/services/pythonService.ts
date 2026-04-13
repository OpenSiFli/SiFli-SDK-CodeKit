import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { spawn } from 'child_process';
import { ConfigService } from './configService';
import { LogService } from './logService';
import { RegionService } from './regionService';
import { ManagedToolSupport } from './managedToolSupport';

export class PythonService {
  private static instance: PythonService;
  private readonly configService: ConfigService;
  private readonly logService: LogService;
  private readonly toolSupport: ManagedToolSupport;
  private readonly installPromises = new Map<string, Promise<void>>();
  private context?: vscode.ExtensionContext;

  private static readonly PYTHON_URLS = {
    x64: 'https://downloads.sifli.com/dl/sifli-sdk/python-embed/python-3.13.9-embed-amd64.zip',
    arm64: 'https://downloads.sifli.com/dl/sifli-sdk/python-embed/python-3.13.9-embed-arm64.zip',
    ia32: 'https://downloads.sifli.com/dl/sifli-sdk/python-embed/python-3.13.9-embed-win32.zip',
  };
  private static readonly GET_PIP_URL = 'https://downloads.sifli.com/dl/sifli-sdk/python-embed/get-pip.py';

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.logService = LogService.getInstance();
    this.toolSupport = new ManagedToolSupport(this.logService, this.configService);
  }

  public static getInstance(): PythonService {
    if (!PythonService.instance) {
      PythonService.instance = new PythonService();
    }
    return PythonService.instance;
  }

  public setContext(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * 获取默认的嵌入式 Python 安装目录（全局存储）
   */
  private getDefaultInstallDir(): string | undefined {
    if (!this.context) {
      return undefined;
    }
    return path.join(this.context.globalStorageUri.fsPath, 'python-embed');
  }

  /**
   * 检查目标目录是否已安装并可用（存在 python.exe 和 Scripts/pip.exe）
   */
  private isEmbeddedPythonReady(dir: string | undefined): boolean {
    if (!dir) {
      return false;
    }
    const pythonExe = path.join(dir, 'python.exe');
    const pipExe = path.join(dir, 'Scripts', 'pip.exe');
    return fs.existsSync(pythonExe) && fs.existsSync(pipExe);
  }

  /**
   * 获取 Python 可执行文件路径
   * 优先使用配置的嵌入式 Python，其次检查默认安装位置，最后回退到系统 Python
   */
  public getPythonPath(): string {
    const configuredPath = this.configService.config.embeddedPythonPath;
    const configuredPython = this.getEmbeddedPythonExecutablePath(configuredPath);
    if (configuredPython) {
      return configuredPython;
    }

    const defaultPython = this.getEmbeddedPythonExecutablePath(this.getDefaultInstallDir());
    if (defaultPython) {
      return defaultPython;
    }

    return 'python';
  }

  /**
   * 获取 Python 所在目录
   */
  public getPythonDir(): string | undefined {
    const pythonPath = this.getPythonPath();
    if (pythonPath === 'python') {
      return undefined;
    }
    return path.dirname(pythonPath);
  }

  /**
   * 检查是否需要安装嵌入式 Python (仅限 Windows)
   */
  public async checkAndInstallPython(): Promise<void> {
    if (process.platform !== 'win32') {
      return;
    }

    if (!this.configService.config.useEmbeddedPython) {
      this.logService.info('Embedded Python is disabled by configuration.');
      return;
    }

    const configuredDir = this.configService.config.embeddedPythonPath;
    const defaultDir = this.getDefaultInstallDir();

    if (this.isEmbeddedPythonReady(configuredDir)) {
      this.logService.info(`Using embedded Python at configured path: ${configuredDir}`);
      return;
    }
    if (this.isEmbeddedPythonReady(defaultDir)) {
      this.logService.info(`Using embedded Python at default path: ${defaultDir}`);
      return;
    }

    const targetDir = configuredDir || defaultDir;
    if (!targetDir) {
      this.logService.error('Cannot determine embedded Python install directory (missing extension context).');
      vscode.window.showErrorMessage(
        vscode.l10n.t('Cannot determine embedded Python install path. Extension context is not initialized.')
      );
      return;
    }

    vscode.window.showInformationMessage(
      vscode.l10n.t('SiFli embedded Python is not installed. Downloading and installing...')
    );
    await this.installEmbeddedPython(targetDir);
  }

  /**
   * 下载并安装嵌入式 Python
   */
  public async installEmbeddedPython(installDir: string): Promise<void> {
    if (this.isEmbeddedPythonReady(installDir)) {
      this.logService.info(`Embedded Python already installed at ${installDir}, skipping.`);
      return;
    }

    const existingPromise = this.installPromises.get(installDir);
    if (existingPromise) {
      return existingPromise;
    }

    const installPromise = this.installEmbeddedPythonInternal(installDir);
    this.installPromises.set(installDir, installPromise);
    try {
      await installPromise;
    } finally {
      this.installPromises.delete(installDir);
    }
  }

  private async installEmbeddedPythonInternal(installDir: string): Promise<void> {
    const executablePath = await this.toolSupport.installManagedArchiveTool({
      toolLabel: 'embedded Python',
      installDir,
      asset: {
        fileName: 'python-embed.zip',
        downloadUrl: this.getPythonDownloadUrl(),
        archiveType: 'zip',
      },
      installingTitle: vscode.l10n.t('Installing embedded Python...'),
      downloadingMessage: vscode.l10n.t('Downloading bundled embedded Python...'),
      extractingMessage: vscode.l10n.t('Extracting...'),
      missingExecutableMessage: vscode.l10n.t('Embedded Python executable not found.'),
      successMessage: vscode.l10n.t('Embedded Python installed successfully.'),
      failureMessage: error =>
        vscode.l10n.t('Failed to install embedded Python: {0}', error instanceof Error ? error.message : String(error)),
      resolveExecutablePath: () => this.getEmbeddedPythonExecutablePath(installDir),
      injectPathOnSuccess: false,
      afterExtract: async ({ installDir: extractedInstallDir, progress }) => {
        this.removePythonPthFile(extractedInstallDir);

        try {
          progress.report({ message: vscode.l10n.t('Installing pip...'), increment: 0 });
          await this.installPip(extractedInstallDir);
        } catch (err) {
          this.logService.warn('Failed to install pip for embedded Python', err);
        }

        await this.configService.updateConfigValue('embeddedPythonPath', extractedInstallDir);
        this.logService.info('Embedded Python installed successfully.');
      },
    });

    if (!executablePath) {
      throw new Error(vscode.l10n.t('Embedded Python executable not found.'));
    }
  }

  private getEmbeddedPythonExecutablePath(dir: string | undefined): string | undefined {
    return this.toolSupport.resolveExecutablePath(dir, { exactRelativePath: 'python.exe' });
  }

  private getPythonDownloadUrl(): string {
    const arch = os.arch();
    if (arch === 'arm64') {
      return PythonService.PYTHON_URLS.arm64;
    }
    if (arch === 'ia32') {
      return PythonService.PYTHON_URLS.ia32;
    }
    return PythonService.PYTHON_URLS.x64;
  }

  private removePythonPthFile(installDir: string): void {
    const pthFile = path.join(installDir, 'python313._pth');
    if (!fs.existsSync(pthFile)) {
      return;
    }

    try {
      fs.unlinkSync(pthFile);
      this.logService.info('Removed python313._pth to enable site-packages and dynamic imports.');
    } catch (err) {
      this.logService.warn('Failed to remove python313._pth', err);
    }
  }

  /**
   * 下载并安装 pip（通过 get-pip.py）
   */
  private async installPip(installDir: string): Promise<void> {
    const getPipPath = path.join(installDir, 'get-pip.py');
    const pythonExe = path.join(installDir, 'python.exe');

    if (!fs.existsSync(pythonExe)) {
      throw new Error('Embedded Python executable not found.');
    }

    this.logService.info(`Downloading get-pip.py from ${PythonService.GET_PIP_URL} to ${getPipPath}`);
    const response = await axios({
      method: 'GET',
      url: PythonService.GET_PIP_URL,
      responseType: 'stream',
    });

    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(getPipPath);
      writer.on('finish', resolve);
      writer.on('error', reject);
      response.data.on('error', reject);
      response.data.pipe(writer);
    });

    this.logService.info('Installing pip using embedded Python...');
    const pipEnv = { ...process.env };
    try {
      const regionService = RegionService.getInstance();
      const inChina = await regionService.isUserInChina();
      if (inChina) {
        pipEnv.PIP_INDEX_URL = 'https://mirrors.ustc.edu.cn/pypi/simple';
        this.logService.info(`Using pip mirror: ${pipEnv.PIP_INDEX_URL}`);
      }
    } catch (err) {
      this.logService.warn('Region detection failed before pip install; using default PyPI.', err);
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(pythonExe, [getPipPath, '--no-warn-script-location'], { cwd: installDir, env: pipEnv });
      let stderrOutput = '';

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderrOutput += text;
        this.logService.warn('pip install stderr:', text.trim());
      });

      proc.on('error', (err: Error) => reject(err));
      proc.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`pip installation failed with exit code ${code}${stderrOutput ? `: ${stderrOutput}` : ''}`));
        }
      });
    });

    try {
      fs.unlinkSync(getPipPath);
    } catch {
      this.logService.warn('Failed to delete get-pip.py after installation.');
    }

    this.logService.info('pip installed successfully for embedded Python.');
  }
}
