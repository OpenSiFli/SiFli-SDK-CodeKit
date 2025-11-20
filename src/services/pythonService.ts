import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { ConfigService } from './configService';
import { LogService } from './logService';

export class PythonService {
  private static instance: PythonService;
  private configService: ConfigService;
  private logService: LogService;
  private context?: vscode.ExtensionContext;

  private static readonly PYTHON_URLS = {
    x64: 'https://downloads.sifli.com/dl/sifli-sdk/python-embed/python-3.13.9-embed-amd64.zip',
    arm64: 'https://downloads.sifli.com/dl/sifli-sdk/python-embed/python-3.13.9-embed-arm64.zip',
    ia32: 'https://downloads.sifli.com/dl/sifli-sdk/python-embed/python-3.13.9-embed-win32.zip'
  };

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.logService = LogService.getInstance();
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
   * 获取 Python 可执行文件路径
   * 优先使用配置的嵌入式 Python，其次检查默认安装位置，最后回退到系统 Python
   */
  public getPythonPath(): string {
    // 1. 检查配置的路径
    const configuredPath = this.configService.config.embeddedPythonPath;
    if (configuredPath && fs.existsSync(configuredPath)) {
      const pythonExe = path.join(configuredPath, 'python.exe');
      if (fs.existsSync(pythonExe)) {
        return pythonExe;
      }
    }

    // 2. 检查默认安装位置 (Global Storage)
    if (this.context) {
      const defaultInstallDir = path.join(this.context.globalStorageUri.fsPath, 'python-embed');
      const defaultPythonExe = path.join(defaultInstallDir, 'python.exe');
      if (fs.existsSync(defaultPythonExe)) {
        return defaultPythonExe;
      }
    }

    // 3. 回退到系统 Python
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

    // 检查配置是否启用了嵌入式 Python
    if (!this.configService.config.useEmbeddedPython) {
      this.logService.info('Embedded Python is disabled by configuration.');
      return;
    }

    const pythonPath = this.getPythonPath();
    if (pythonPath !== 'python') {
      this.logService.info(`Using embedded Python at: ${pythonPath}`);
      return;
    }

    // 如果没有找到嵌入式 Python，提示用户并自动安装
    vscode.window.showInformationMessage('检测到未安装 SiFli Python 环境，正在自动下载并安装...');
    await this.installEmbeddedPython();
  }

  /**
   * 下载并安装嵌入式 Python
   */
  public async installEmbeddedPython(): Promise<void> {
    if (!this.context) {
      vscode.window.showErrorMessage('Extension context not initialized.');
      return;
    }

    const installDir = path.join(this.context.globalStorageUri.fsPath, 'python-embed');
    
    // 确保目录存在
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
    }

    const arch = os.arch();
    let downloadUrl = PythonService.PYTHON_URLS.x64; // 默认 x64
    if (arch === 'arm64') {
      downloadUrl = PythonService.PYTHON_URLS.arm64;
    } else if (arch === 'ia32') {
      downloadUrl = PythonService.PYTHON_URLS.ia32;
    }

    const zipPath = path.join(installDir, 'python-embed.zip');

    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '正在下载嵌入式 Python...',
        cancellable: false
      }, async (progress) => {
        // 1. 下载
        this.logService.info(`Downloading Python from ${downloadUrl} to ${zipPath}`);
        const response = await axios({
          method: 'GET',
          url: downloadUrl,
          responseType: 'stream'
        });

        const totalLength = response.headers['content-length'];
        const writer = fs.createWriteStream(zipPath);

        let downloadedLength = 0;
        response.data.on('data', (chunk: any) => {
          downloadedLength += chunk.length;
          if (totalLength) {
            const percentage = Math.round((downloadedLength / totalLength) * 100);
            progress.report({ message: `${percentage}%`, increment: 0 });
          }
        });

        await new Promise<void>((resolve, reject) => {
          writer.on('finish', () => resolve());
          writer.on('error', reject);
          response.data.pipe(writer);
        });

        // 2. 解压
        progress.report({ message: '正在解压...', increment: 0 });
        this.logService.info(`Extracting Python to ${installDir}`);
        
        // 使用 PowerShell 解压
        const command = `Expand-Archive -Path "${zipPath}" -DestinationPath "${installDir}" -Force`;
        await this.runPowerShellCommand(command);

        // 3. 清理
        fs.unlinkSync(zipPath);
        
        // 4. 更新配置
        await this.configService.updateConfigValue('embeddedPythonPath', installDir);
        
        // 5. 修改 python313._pth 文件以允许导入 site-packages (如果需要)
        // 嵌入式 Python 默认忽略 site-packages，如果需要安装包，需要修改 .pth 文件
        // 这里暂时不修改，除非后续有需求安装 pip 包
        
        this.logService.info('Embedded Python installed successfully.');
      });

      vscode.window.showInformationMessage('嵌入式 Python 安装成功！');

    } catch (error) {
      this.logService.error('Error installing embedded Python:', error);
      vscode.window.showErrorMessage(`安装嵌入式 Python 失败: ${error}`);
      // 清理可能残留的文件
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    }
  }

  private async runPowerShellCommand(command: string): Promise<void> {
    const configuredPath = this.configService.config.powershellPath;
    const powershellPath = configuredPath && configuredPath.trim() !== '' ? configuredPath : 'powershell.exe';
    const childProcess = require('child_process');
    
    return new Promise((resolve, reject) => {
      childProcess.exec(`& "${powershellPath}" -Command "${command}"`, { shell: powershellPath }, (error: any, stdout: string, stderr: string) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
