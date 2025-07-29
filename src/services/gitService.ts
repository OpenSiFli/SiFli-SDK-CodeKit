import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import axios from 'axios';
import { SdkRelease, SdkBranch } from '../types';
import { GIT_REPOS } from '../constants';

export class GitService {
  private static instance: GitService;
  private gitOutputChannel: vscode.OutputChannel;

  private constructor() {
    this.gitOutputChannel = vscode.window.createOutputChannel('SiFli SDK Git Operations');
  }

  public static getInstance(): GitService {
    if (!GitService.instance) {
      GitService.instance = new GitService();
    }
    return GitService.instance;
  }

  public getOutputChannel(): vscode.OutputChannel {
    return this.gitOutputChannel;
  }

  /**
   * 检查 Git 是否已安装
   */
  public async isGitInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('git --version', (error) => {
        if (error) {
          console.error(`[GitService] Git is not installed or not in PATH: ${error.message}`);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * 获取 SiFli SDK 发布版本列表
   */
  public async fetchSiFliSdkReleases(source: 'github' | 'gitee'): Promise<SdkRelease[]> {
    try {
      const apiUrl = source === 'github' 
        ? `${GIT_REPOS.GITHUB.API_BASE}/releases`
        : `${GIT_REPOS.GITEE.API_BASE}/releases`;

      const response = await axios.get(apiUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'SiFli-SDK-CodeKit'
        }
      });

      if (source === 'github') {
        return response.data.map((release: any) => ({
          tag_name: release.tag_name,
          name: release.name,
          published_at: release.published_at,
          tarball_url: release.tarball_url,
          zipball_url: release.zipball_url
        }));
      } else {
        // Gitee API format
        return response.data.map((release: any) => ({
          tag_name: release.tag_name,
          name: release.name,
          published_at: release.created_at,
          tarball_url: release.tarball_url,
          zipball_url: release.zipball_url
        }));
      }
    } catch (error) {
      console.error(`[GitService] Error fetching releases from ${source}:`, error);
      throw new Error(`无法获取 ${source} 发布版本: ${error}`);
    }
  }

  /**
   * 获取 SiFli SDK 分支列表
   */
  public async fetchSiFliSdkBranches(source: 'github' | 'gitee'): Promise<SdkBranch[]> {
    try {
      const apiUrl = source === 'github'
        ? `${GIT_REPOS.GITHUB.API_BASE}/branches`
        : `${GIT_REPOS.GITEE.API_BASE}/branches`;

      const response = await axios.get(apiUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'SiFli-SDK-CodeKit'
        }
      });

      return response.data.map((branch: any) => ({
        name: branch.name,
        commit: {
          sha: branch.commit.sha,
          url: branch.commit.url
        }
      }));
    } catch (error) {
      console.error(`[GitService] Error fetching branches from ${source}:`, error);
      throw new Error(`无法获取 ${source} 分支列表: ${error}`);
    }
  }

  /**
   * 执行 Git 命令
   */
  public async executeGitCommand(command: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.gitOutputChannel.appendLine(`[Git] Executing: ${command} ${args.join(' ')}`);
      this.gitOutputChannel.appendLine(`[Git] Working directory: ${cwd}`);

      const gitProcess = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let hasError = false;

      gitProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        this.gitOutputChannel.append(output);
      });

      gitProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        this.gitOutputChannel.append(output);
        
        // Git 的进度信息通常通过 stderr 输出，这不一定是错误
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('fatal')) {
          hasError = true;
        }
      });

      gitProcess.on('close', (code) => {
        this.gitOutputChannel.appendLine(`[Git] Process exited with code: ${code}`);
        
        if (code === 0 && !hasError) {
          resolve();
        } else {
          reject(new Error(`Git 命令执行失败，退出代码: ${code}`));
        }
      });

      gitProcess.on('error', (error) => {
        this.gitOutputChannel.appendLine(`[Git] Process error: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * 安装 SiFli SDK
   */
  public async installSiFliSdk(
    source: 'github' | 'gitee',
    type: 'tag' | 'branch',
    name: string,
    installPath: string,
    webview?: vscode.Webview
  ): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'SiFli SDK 安装中',
        cancellable: false
      },
      async (progress) => {
        let currentProgress = 0;

        const updateProgress = (message: string, increment: number) => {
          currentProgress += increment;
          progress.report({ message, increment });
          this.gitOutputChannel.appendLine(`[SDK Installer] ${message} (${currentProgress}%)`);
        };

        try {
          updateProgress('检查 Git 安装...', 5);
          if (!(await this.isGitInstalled())) {
            throw new Error('Git 未安装或不在 PATH 中。请先安装 Git。');
          }

          if (type === 'tag') {
            updateProgress('检查最新版本信息...', 10);
            try {
              const allReleases = await this.fetchSiFliSdkReleases(source);
              if (allReleases.length > 0) {
                const latestReleaseTag = allReleases[0].tag_name;
                if (name !== latestReleaseTag) {
                  const userChoice = await vscode.window.showWarningMessage(
                    `您选择的版本是 ${name}, 但最新版本是 ${latestReleaseTag}。是否要安装最新版本？`,
                    '安装最新版本',
                    '安装我选择的版本'
                  );
                  if (userChoice === '安装最新版本') {
                    name = latestReleaseTag;
                  } else if (userChoice === undefined) {
                    throw new Error('用户取消安装。');
                  }
                }
              }
            } catch (error) {
              updateProgress('无法获取最新版本信息，继续安装指定版本。', 0);
            }
          }

          updateProgress('准备安装路径...', 10);
          if (fs.existsSync(installPath)) {
            const response = await vscode.window.showWarningMessage(
              `安装路径 '${installPath}' 已存在。是否清空并继续安装？`,
              '清空并继续',
              '取消'
            );
            if (response === '清空并继续') {
              updateProgress(`清空现有目录: ${installPath}`, 10);
              try {
                fs.rmSync(installPath, { recursive: true, force: true });
              } catch (error) {
                throw new Error(`清空目录失败: ${error}`);
              }
            } else {
              throw new Error('用户取消安装。');
            }
          }

          const parentDir = path.dirname(installPath);
          if (!fs.existsSync(parentDir)) {
            updateProgress(`创建父目录: ${parentDir}`, 5);
            try {
              fs.mkdirSync(parentDir, { recursive: true });
            } catch (error) {
              throw new Error(`创建父目录失败: ${error}`);
            }
          }

          updateProgress(`开始克隆 Git 仓库 (${type}: ${name})...`, 0);
          const repoUrl = source === 'github' ? GIT_REPOS.GITHUB.GIT_URL : GIT_REPOS.GITEE.GIT_URL;
          const gitArgs = [
            'clone',
            '--recursive',
            '--progress',
            repoUrl,
            '-b',
            name,
            installPath
          ];

          await this.executeGitCommand('git', gitArgs, parentDir);
          updateProgress('Git 克隆和版本/分支切换完成。', 45);

          updateProgress('SDK 安装流程最终完成。', 15);
          vscode.window.showInformationMessage('SiFli SDK 已成功安装！');
          webview?.postMessage({ command: 'installationComplete' });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`SiFli SDK 安装失败: ${errorMessage}`);
          this.gitOutputChannel.appendLine(`!!! SiFli SDK 安装失败: ${errorMessage}`);
          webview?.postMessage({
            command: 'installationError',
            error: errorMessage
          });

          // 清理失败的安装
          if (fs.existsSync(installPath)) {
            try {
              vscode.window.showWarningMessage('安装失败，尝试清理部分文件...');
              fs.rmSync(installPath, { recursive: true, force: true });
              this.gitOutputChannel.appendLine(`!!! 已尝试清理部分安装目录: ${installPath}`);
            } catch (cleanupError) {
              this.gitOutputChannel.appendLine(`!!! 清理目录失败: ${cleanupError}`);
              vscode.window.showWarningMessage(
                `安装失败，且无法完全清理目录: ${cleanupError}`
              );
            }
          }
        } finally {
          this.gitOutputChannel.show(true);
        }
      }
    );
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.gitOutputChannel.dispose();
  }
}
