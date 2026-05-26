import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { BoardService } from './boardService';
import { ConfigService } from './configService';
import { LogService } from './logService';
import { SdkService } from './sdkService';
import { WindowsManagedEnvService } from './windowsManagedEnvService';
import { KconfigChange, KconfigSnapshot } from '../types';
import { getProjectInfo } from '../utils/projectUtils';
import {
  buildPowerShellDotSourceCommandWithOutputToError,
  resolvePowerShellExecutable,
} from '../utils/powerShellUtils';

type BridgeCommand = 'snapshot' | 'preview' | 'save';

interface KconfigBridgeContext {
  workspaceRoot: string;
  projectPath: string;
  sdkPath: string;
  boardName: string;
  boardSearchPath?: string;
  configPath: string;
  buildDir: string;
}

interface ExportedShellEnvironment {
  sdkPath: string;
  exportScriptPath: string;
  env: NodeJS.ProcessEnv;
}

export class KconfigService {
  private static instance: KconfigService;
  private readonly configService: ConfigService;
  private readonly boardService: BoardService;
  private readonly sdkService: SdkService;
  private readonly logService: LogService;
  private exportedEnvironment?: ExportedShellEnvironment;
  private context?: vscode.ExtensionContext;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.boardService = BoardService.getInstance();
    this.sdkService = SdkService.getInstance();
    this.logService = LogService.getInstance();
  }

  public static getInstance(): KconfigService {
    if (!KconfigService.instance) {
      KconfigService.instance = new KconfigService();
    }
    return KconfigService.instance;
  }

  public setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  public async getSnapshot(): Promise<KconfigSnapshot> {
    const bridgeContext = await this.resolveBridgeContext();
    return this.runBridge('snapshot', bridgeContext);
  }

  public async previewChanges(changes: KconfigChange[]): Promise<KconfigSnapshot> {
    const bridgeContext = await this.resolveBridgeContext();
    return this.runBridge('preview', bridgeContext, changes);
  }

  public async saveChanges(changes: KconfigChange[]): Promise<KconfigSnapshot> {
    const bridgeContext = await this.resolveBridgeContext();
    return this.runBridge('save', bridgeContext, changes);
  }

  private async resolveBridgeContext(): Promise<KconfigBridgeContext> {
    const projectInfo = getProjectInfo();
    if (!projectInfo) {
      throw new Error(vscode.l10n.t('Open a SiFli project before using graphical Menuconfig.'));
    }

    const sdkPath = this.resolveCurrentSdkPath();
    const boardName = this.configService.getSelectedBoardName();
    if (!boardName || boardName === 'N/A') {
      throw new Error(vscode.l10n.t('Select a SiFli board before using graphical Menuconfig.'));
    }

    const configPath = path.join(projectInfo.projectEntryPath, 'proj.conf');
    if (!fs.existsSync(configPath)) {
      throw new Error(vscode.l10n.t('Project config file not found: {0}', configPath));
    }

    const kconfigProjPath = path.join(projectInfo.projectEntryPath, 'Kconfig.proj');
    if (!fs.existsSync(kconfigProjPath)) {
      throw new Error(vscode.l10n.t('Project Kconfig.proj not found: {0}', kconfigProjPath));
    }

    const boardSearchPath = await this.resolveBoardSearchPath(boardName, projectInfo.workspaceRoot);
    const buildDir = path.join(projectInfo.projectEntryPath, `build_${this.getBuildBoardName(boardName)}`);

    return {
      workspaceRoot: projectInfo.workspaceRoot,
      projectPath: projectInfo.projectEntryPath,
      sdkPath,
      boardName,
      boardSearchPath,
      configPath,
      buildDir,
    };
  }

  private resolveCurrentSdkPath(): string {
    const sdkPath = this.configService.getCurrentSdkPath() || this.configService.getCurrentSdk()?.path || '';
    if (!sdkPath) {
      throw new Error(vscode.l10n.t('Select or activate a SiFli SDK before using graphical Menuconfig.'));
    }
    if (!fs.existsSync(sdkPath)) {
      throw new Error(vscode.l10n.t('Current SDK path does not exist: {0}', sdkPath));
    }
    const kconfiglibPath = path.join(sdkPath, 'tools', 'kconfig', 'kconfiglib.py');
    if (!fs.existsSync(kconfiglibPath)) {
      throw new Error(vscode.l10n.t('SDK Kconfiglib was not found: {0}', kconfiglibPath));
    }
    return sdkPath;
  }

  private async resolveBoardSearchPath(boardName: string, workspaceRoot: string): Promise<string | undefined> {
    const baseBoardName = boardName.replace(/_(hcpu|lcpu|acpu)$/i, '');
    const boards = await this.boardService.discoverBoards();
    const board = boards.find(item => item.name === baseBoardName || item.name === boardName);
    if (!board || board.type === 'sdk') {
      return undefined;
    }

    if (path.isAbsolute(board.path)) {
      return path.dirname(board.path);
    }
    return path.dirname(path.resolve(workspaceRoot, board.path));
  }

  private getBuildBoardName(boardName: string): string {
    const match = boardName.match(/^(.*)_(hcpu|lcpu|acpu)$/i);
    if (match) {
      return `${match[1]}_${match[2].toLowerCase()}`;
    }
    return `${boardName}_hcpu`;
  }

  private getBridgeScriptPath(): string {
    if (!this.context) {
      throw new Error(vscode.l10n.t('Extension context is not initialized.'));
    }
    const scriptPath = path.join(this.context.extensionPath, 'scripts', 'kconfig_bridge.py');
    if (!fs.existsSync(scriptPath)) {
      throw new Error(vscode.l10n.t('Kconfig bridge script was not found: {0}', scriptPath));
    }
    return scriptPath;
  }

  private runBridge(
    command: BridgeCommand,
    bridgeContext: KconfigBridgeContext,
    changes: KconfigChange[] = []
  ): Promise<KconfigSnapshot> {
    const scriptPath = this.getBridgeScriptPath();
    const args = [
      scriptPath,
      command,
      '--sdk',
      bridgeContext.sdkPath,
      '--project',
      bridgeContext.projectPath,
      '--workspace',
      bridgeContext.workspaceRoot,
      '--board',
      bridgeContext.boardName,
      '--config',
      bridgeContext.configPath,
      '--build-dir',
      bridgeContext.buildDir,
    ];

    if (bridgeContext.boardSearchPath) {
      args.push('--board-search-path', bridgeContext.boardSearchPath);
    }

    this.logService.info(`Running graphical Menuconfig bridge: ${command}`);

    return new Promise((resolve, reject) => {
      void (async () => {
        let child: ReturnType<typeof spawn> | undefined;
        try {
          const exportedEnv = await this.ensureExportedEnvironment(bridgeContext);
          const env = {
            ...exportedEnv,
            ...this.buildBridgeEnvironment(bridgeContext, exportedEnv),
          };
          child = spawn(this.getExportedPythonPath(exportedEnv), args, {
            cwd: bridgeContext.projectPath,
            env,
            windowsHide: true,
          });

          let stdout = '';
          let stderr = '';
          const timeout = setTimeout(
            () => {
              try {
                child?.kill();
              } catch {
                // Ignore kill failures.
              }
              reject(new Error(vscode.l10n.t('Kconfig operation timed out.')));
            },
            command === 'save' ? 120_000 : 60_000
          );

          child.stdout?.on('data', chunk => {
            stdout += chunk.toString();
          });
          child.stderr?.on('data', chunk => {
            stderr += chunk.toString();
          });
          child.on('error', error => {
            clearTimeout(timeout);
            reject(
              new Error(
                `Failed to run python from exported SiFli SDK environment: ${
                  error instanceof Error ? error.message : String(error)
                }`
              )
            );
          });
          child.on('close', code => {
            clearTimeout(timeout);
            if (code !== 0) {
              reject(new Error(stderr.trim() || stdout.trim() || `Kconfig bridge exited with code ${String(code)}`));
              return;
            }
            try {
              resolve(JSON.parse(stdout) as KconfigSnapshot);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              reject(
                new Error(`Failed to parse Kconfig bridge output: ${message}${stderr ? `${os.EOL}${stderr}` : ''}`)
              );
            }
          });

          if (command === 'preview' || command === 'save') {
            child.stdin?.write(JSON.stringify({ changes }));
          }
          child.stdin?.end();
        } catch (error) {
          reject(error);
        }
      })();
    });
  }

  private async ensureExportedEnvironment(bridgeContext: KconfigBridgeContext): Promise<NodeJS.ProcessEnv> {
    const exportScriptPath = this.sdkService.getExportScriptPath(bridgeContext.sdkPath);
    if (!exportScriptPath || !fs.existsSync(exportScriptPath)) {
      throw new Error(vscode.l10n.t('SDK export script was not found for: {0}', bridgeContext.sdkPath));
    }

    if (
      this.exportedEnvironment &&
      this.exportedEnvironment.sdkPath === bridgeContext.sdkPath &&
      this.exportedEnvironment.exportScriptPath === exportScriptPath
    ) {
      return this.exportedEnvironment.env;
    }

    const env = await this.exportSdkEnvironment(bridgeContext, exportScriptPath);
    this.exportedEnvironment = {
      sdkPath: bridgeContext.sdkPath,
      exportScriptPath,
      env,
    };
    return env;
  }

  private exportSdkEnvironment(
    bridgeContext: KconfigBridgeContext,
    exportScriptPath: string
  ): Promise<NodeJS.ProcessEnv> {
    this.logService.info(`Exporting SiFli SDK environment in background shell: ${exportScriptPath}`);

    const env = {
      ...process.env,
      SIFLI_SDK: bridgeContext.sdkPath,
      SIFLI_SDK_PATH: bridgeContext.sdkPath,
      PYTHONIOENCODING: 'utf-8',
    };

    if (process.platform === 'win32') {
      WindowsManagedEnvService.getInstance().applyInstallScriptEnvironment(env);
    }

    return new Promise((resolve, reject) => {
      const shellInvocation = this.buildExportShellInvocation(exportScriptPath);
      const child = spawn(shellInvocation.command, shellInvocation.args, {
        cwd: bridgeContext.projectPath,
        env,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // Ignore kill failures.
        }
        reject(new Error(vscode.l10n.t('Kconfig operation timed out.')));
      }, 120_000);

      child.stdout?.on('data', chunk => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', chunk => {
        stderr += chunk.toString();
      });
      child.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', code => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `SDK export exited with code ${String(code)}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as NodeJS.ProcessEnv);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          reject(
            new Error(`Failed to parse exported SDK environment: ${message}${stderr ? `${os.EOL}${stderr}` : ''}`)
          );
        }
      });
    });
  }

  private buildExportShellInvocation(exportScriptPath: string): { command: string; args: string[] } {
    const envJsonCommand = `python -c ${this.shellQuote(
      'import json, os, sys; data=dict(os.environ); data["CODEKIT_EXPORTED_PYTHON"]=sys.executable; print(json.dumps(data, ensure_ascii=False))'
    )}`;

    if (process.platform === 'win32') {
      const powerShell = resolvePowerShellExecutable(this.configService.config.powershellPath).executablePath;
      const command = [
        '$ErrorActionPreference = "Stop"',
        buildPowerShellDotSourceCommandWithOutputToError(exportScriptPath),
        envJsonCommand,
        'exit $LASTEXITCODE',
      ].join('; ');
      return {
        command: powerShell,
        args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      };
    }

    const shellPath = process.env.SHELL || '/bin/zsh';
    const shellName = path.basename(shellPath);
    const args = shellName === 'bash' || shellName === 'zsh' ? ['-l', '-c'] : ['-c'];
    const command = ['set -e', `. ${this.shellQuote(exportScriptPath)} 1>&2`, envJsonCommand].join('; ');
    return {
      command: shellPath,
      args: [...args, command],
    };
  }

  private buildBridgeEnvironment(
    bridgeContext: KconfigBridgeContext,
    exportedEnv: NodeJS.ProcessEnv
  ): NodeJS.ProcessEnv {
    return {
      SIFLI_SDK: bridgeContext.sdkPath,
      SIFLI_SDK_PATH: bridgeContext.sdkPath,
      PYTHONIOENCODING: 'utf-8',
      PYTHONPATH: this.buildPythonPath(bridgeContext.sdkPath, exportedEnv),
    };
  }

  private buildPythonPath(sdkPath: string, exportedEnv: NodeJS.ProcessEnv): string {
    const entries = [path.join(sdkPath, 'tools', 'kconfig')];
    if (exportedEnv.PYTHONPATH) {
      entries.push(exportedEnv.PYTHONPATH);
    }
    return entries.join(path.delimiter);
  }

  private getExportedPythonPath(exportedEnv: NodeJS.ProcessEnv): string {
    const pythonPath = exportedEnv.CODEKIT_EXPORTED_PYTHON;
    if (!pythonPath || !pythonPath.trim()) {
      throw new Error(vscode.l10n.t('SDK export did not provide a Python interpreter path.'));
    }
    return pythonPath;
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }
}
