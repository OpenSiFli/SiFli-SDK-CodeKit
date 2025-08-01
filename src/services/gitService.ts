import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import { SdkRelease, SdkBranch } from '../types';
import { GIT_REPOS } from '../constants';

export class GitService {
  private static instance: GitService;
  private gitOutputChannel: vscode.OutputChannel;
  private activeProcesses: Map<string, ChildProcess> = new Map(); // 跟踪活跃的Git进程

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
   * 终止所有活跃的Git进程
   */
  public terminateAllProcesses(): void {
    console.log(`[GitService] Terminating ${this.activeProcesses.size} active processes...`);
    this.gitOutputChannel.appendLine(`[Git] Terminating ${this.activeProcesses.size} active processes...`);
    
    for (const [processId, process] of this.activeProcesses) {
      try {
        if (!process.killed) {
          console.log(`[GitService] Killing process ${processId}...`);
          this.gitOutputChannel.appendLine(`[Git] Killing process ${processId}...`);
          process.kill('SIGTERM');
          
          // 如果进程在3秒内没有退出，使用SIGKILL强制终止
          setTimeout(() => {
            if (!process.killed) {
              console.log(`[GitService] Force killing process ${processId}...`);
              this.gitOutputChannel.appendLine(`[Git] Force killing process ${processId}...`);
              process.kill('SIGKILL');
            }
          }, 3000);
        }
      } catch (error) {
        console.error(`[GitService] Error terminating process ${processId}:`, error);
        this.gitOutputChannel.appendLine(`[Git] Error terminating process ${processId}: ${error}`);
      }
    }
    
    this.activeProcesses.clear();
  }

  /**
   * 移除已完成的进程
   */
  private removeProcess(processId: string): void {
    this.activeProcesses.delete(processId);
    console.log(`[GitService] Removed process ${processId}, ${this.activeProcesses.size} processes remaining`);
  }

  /**
   * 检查 Git 是否已安装
   */
  public async isGitInstalled(): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        const gitProcess = spawn('git', ['--version'], {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        // 为版本检查进程生成ID
        const processId = `version-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.activeProcesses.set(processId, gitProcess);
        
        gitProcess.on('close', (code) => {
          this.removeProcess(processId);
          resolve(code === 0);
        });
        
        gitProcess.on('error', () => {
          this.removeProcess(processId);
          resolve(false);
        });
        
        // 版本检查超时
        setTimeout(() => {
          if (this.activeProcesses.has(processId) && !gitProcess.killed) {
            gitProcess.kill();
            this.removeProcess(processId);
            resolve(false);
          }
        }, 5000); // 5秒超时
      });
    } catch (error) {
      console.error(`[GitService] Git is not installed or not in PATH: ${error}`);
      this.gitOutputChannel.appendLine(`[GitService] Git is not installed: ${error}`);
      return false;
    }
  }

  /**
   * 获取 SiFli SDK 发布版本列表
   */
  public async fetchSiFliSdkReleases(source: 'github' | 'gitee'): Promise<SdkRelease[]> {
    try {
      const apiUrl = source === 'github' 
        ? `${GIT_REPOS.GITHUB.API_BASE}/releases`
        : `${GIT_REPOS.GITEE.API_BASE}/releases`;

      console.log(`[GitService] Fetching releases from: ${apiUrl}`);
      this.gitOutputChannel.appendLine(`[GitService] Fetching releases from: ${apiUrl}`);

      const response = await axios.get(apiUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'SiFli-SDK-CodeKit'
        }
      });

      console.log(`[GitService] Response status: ${response.status}, data length: ${response.data.length}`);
      this.gitOutputChannel.appendLine(`[GitService] Response status: ${response.status}, data length: ${response.data.length}`);

      if (source === 'github') {
        const releases = response.data.map((release: any) => ({
          tagName: release.tag_name,
          name: release.name,
          publishedAt: release.published_at,
          prerelease: release.prerelease || false
        }));
        console.log(`[GitService] Processed ${releases.length} GitHub releases`);
        this.gitOutputChannel.appendLine(`[GitService] Processed ${releases.length} GitHub releases`);
        return releases;
      } else {
        // Gitee API format
        const releases = response.data.map((release: any) => ({
          tagName: release.tag_name,
          name: release.name,
          publishedAt: release.created_at,
          prerelease: false
        }));
        console.log(`[GitService] Processed ${releases.length} Gitee releases`);
        this.gitOutputChannel.appendLine(`[GitService] Processed ${releases.length} Gitee releases`);
        return releases;
      }
    } catch (error) {
      console.error(`[GitService] Error fetching releases from ${source}:`, error);
      this.gitOutputChannel.appendLine(`[GitService] Error fetching releases from ${source}: ${error}`);
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

      console.log(`[GitService] Fetching branches from: ${apiUrl}`);
      this.gitOutputChannel.appendLine(`[GitService] Fetching branches from: ${apiUrl}`);

      const response = await axios.get(apiUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'SiFli-SDK-CodeKit'
        }
      });

      console.log(`[GitService] Response status: ${response.status}, data length: ${response.data.length}`);
      this.gitOutputChannel.appendLine(`[GitService] Response status: ${response.status}, data length: ${response.data.length}`);

      const branches = response.data.map((branch: any) => ({
        name: branch.name,
        commit: {
          sha: branch.commit.sha,
          url: branch.commit.url
        }
      }));

      console.log(`[GitService] Processed ${branches.length} branches`);
      this.gitOutputChannel.appendLine(`[GitService] Processed ${branches.length} branches`);
      return branches;
    } catch (error) {
      console.error(`[GitService] Error fetching branches from ${source}:`, error);
      this.gitOutputChannel.appendLine(`[GitService] Error fetching branches from ${source}: ${error}`);
      throw new Error(`无法获取 ${source} 分支列表: ${error}`);
    }
  }

  /**
   * 使用原生 Git 命令克隆仓库（备用方案）
   */
  public async cloneRepositoryNative(
    repoUrl: string, 
    localPath: string, 
    options?: {
      branch?: string;
      depth?: number;
      onProgress?: (progress: string) => void;
    }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[GitService] Using native git clone as fallback...`);
      this.gitOutputChannel.appendLine(`[Git] Native clone: ${repoUrl} to ${localPath}`);

      // 构建 Git 命令
      const args = ['clone', '--recursive', '--progress'];
      
      if (options?.branch) {
        args.push('--branch', options.branch);
      }
      
      if (options?.depth) {
        args.push('--depth', options.depth.toString());
      }
      
      args.push(repoUrl, localPath);
      
      console.log(`[GitService] Native git command: git ${args.join(' ')}`);
      this.gitOutputChannel.appendLine(`[Git] Command: git ${args.join(' ')}`);

      const gitProcess = spawn('git', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // 生成进程ID并跟踪进程
      const processId = `clone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.activeProcesses.set(processId, gitProcess);
      console.log(`[GitService] Started clone process ${processId}`);

      let hasError = false;
      let errorOutput = '';
      let stdOutput = '';

      gitProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        stdOutput += output;
        console.log(`[GitService] Native clone stdout: ${output.trim()}`);
        this.gitOutputChannel.append(output);
        if (options?.onProgress) {
          options.onProgress(output.trim());
        }
      });

      gitProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        errorOutput += output;
        console.log(`[GitService] Native clone stderr: ${output.trim()}`);
        this.gitOutputChannel.append(output);
        
        // Git 的进度信息通常通过 stderr 输出
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('fatal')) {
          hasError = true;
        }
        
        if (options?.onProgress) {
          options.onProgress(output.trim());
        }
      });

      gitProcess.on('close', (code: number) => {
        console.log(`[GitService] Native clone process ${processId} exited with code: ${code}`);
        this.gitOutputChannel.appendLine(`[Git] Process ${processId} exited with code: ${code}`);
        
        // 从活跃进程列表中移除
        this.removeProcess(processId);
        
        if (code === 0 && !hasError) {
          resolve();
        } else {
          const errorMessage = `Git clone 命令执行失败，退出代码: ${code}`;
          const detailedError = errorOutput.trim() || stdOutput.trim() || '无详细错误信息';
          console.error(`[GitService] Git clone failed. Error output: ${detailedError}`);
          this.gitOutputChannel.appendLine(`[Git] Error details: ${detailedError}`);
          reject(new Error(`${errorMessage}\n详细错误: ${detailedError}`));
        }
      });

      gitProcess.on('error', (error: Error) => {
        console.error(`[GitService] Native clone process ${processId} error:`, error);
        this.gitOutputChannel.appendLine(`[Git] Process ${processId} error: ${error.message}`);
        
        // 从活跃进程列表中移除
        this.removeProcess(processId);
        reject(error);
      });

      // 设置超时
      setTimeout(() => {
        if (this.activeProcesses.has(processId) && !gitProcess.killed) {
          console.log(`[GitService] Native clone timeout, killing process ${processId}...`);
          this.gitOutputChannel.appendLine(`[Git] Process ${processId} timeout, killing...`);
          gitProcess.kill();
          this.removeProcess(processId);
          reject(new Error('Git clone 操作超时'));
        }
      }, 10 * 60 * 1000); // 10分钟超时
    });
  }

  /**
   * 克隆仓库
   */
  public async cloneRepository(
    repoUrl: string, 
    localPath: string, 
    options?: {
      branch?: string;
      depth?: number;
      onProgress?: (progress: string) => void;
    }
  ): Promise<void> {
    try {
      console.log(`[GitService] Starting clone operation...`);
      console.log(`[GitService] Repository URL: ${repoUrl}`);
      console.log(`[GitService] Local path: ${localPath}`);
      console.log(`[GitService] Options:`, options);
      
      this.gitOutputChannel.appendLine(`[Git] Cloning repository: ${repoUrl} to ${localPath}`);
      
      // 检查父目录是否存在，如果不存在则创建
      const parentDir = path.dirname(localPath);
      if (!fs.existsSync(parentDir)) {
        console.log(`[GitService] Creating parent directory: ${parentDir}`);
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // 如果目标目录已存在，先删除它
      if (fs.existsSync(localPath)) {
        console.log(`[GitService] Target directory exists, removing: ${localPath}`);
        this.gitOutputChannel.appendLine(`[Git] Removing existing directory: ${localPath}`);
        fs.rmSync(localPath, { recursive: true, force: true });
      }

      // 直接使用 native Git 命令
      await this.cloneRepositoryNative(repoUrl, localPath, options);
      
      console.log(`[GitService] Clone operation completed successfully`);
      this.gitOutputChannel.appendLine(`[Git] Successfully cloned repository to ${localPath}`);
      
      // 验证克隆结果
      if (fs.existsSync(localPath)) {
        console.log(`[GitService] Clone verification: directory exists`);
        const files = fs.readdirSync(localPath);
        console.log(`[GitService] Clone verification: ${files.length} files/directories found`);
        this.gitOutputChannel.appendLine(`[Git] Clone verification: ${files.length} items in directory`);
      } else {
        throw new Error('克隆完成但目标目录不存在');
      }
      
    } catch (error) {
      console.error(`[GitService] Clone operation failed:`, error);
      this.gitOutputChannel.appendLine(`[Git] Clone failed: ${error}`);
      
      // 提供更详细的错误信息
      if (error instanceof Error) {
        throw new Error(`克隆仓库失败: ${error.message}`);
      } else {
        throw new Error(`克隆仓库失败: ${String(error)}`);
      }
    }
  }

  /**
   * 切换分支 - 使用 native Git 命令
   */
  public async checkoutBranch(repoPath: string, branchName: string): Promise<void> {
    try {
      this.gitOutputChannel.appendLine(`[Git] Checking out branch: ${branchName} in ${repoPath}`);
      
      return new Promise((resolve, reject) => {
        const gitProcess = spawn('git', ['checkout', branchName], {
          cwd: repoPath,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let errorOutput = '';

        gitProcess.stderr?.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });

        gitProcess.on('close', (code: number) => {
          if (code === 0) {
            this.gitOutputChannel.appendLine(`[Git] Successfully checked out branch: ${branchName}`);
            resolve();
          } else {
            this.gitOutputChannel.appendLine(`[Git] Checkout failed: ${errorOutput}`);
            reject(new Error(`切换分支失败: ${errorOutput}`));
          }
        });

        gitProcess.on('error', (error: Error) => {
          this.gitOutputChannel.appendLine(`[Git] Checkout process error: ${error.message}`);
          reject(error);
        });
      });
    } catch (error) {
      this.gitOutputChannel.appendLine(`[Git] Checkout failed: ${error}`);
      throw new Error(`切换分支失败: ${error}`);
    }
  }

  /**
   * 拉取最新代码 - 使用 native Git 命令
   */
  public async pullLatest(repoPath: string): Promise<void> {
    try {
      this.gitOutputChannel.appendLine(`[Git] Pulling latest changes in ${repoPath}`);
      
      return new Promise((resolve, reject) => {
        const gitProcess = spawn('git', ['pull'], {
          cwd: repoPath,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let errorOutput = '';
        let stdOutput = '';

        gitProcess.stdout?.on('data', (data: Buffer) => {
          stdOutput += data.toString();
        });

        gitProcess.stderr?.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });

        gitProcess.on('close', (code: number) => {
          if (code === 0) {
            this.gitOutputChannel.appendLine(`[Git] Successfully pulled latest changes`);
            resolve();
          } else {
            this.gitOutputChannel.appendLine(`[Git] Pull failed: ${errorOutput}`);
            reject(new Error(`拉取代码失败: ${errorOutput}`));
          }
        });

        gitProcess.on('error', (error: Error) => {
          this.gitOutputChannel.appendLine(`[Git] Pull process error: ${error.message}`);
          reject(error);
        });
      });
    } catch (error) {
      this.gitOutputChannel.appendLine(`[Git] Pull failed: ${error}`);
      throw new Error(`拉取代码失败: ${error}`);
    }
  }

  /**
   * 获取当前分支名 - 使用 native Git 命令
   */
  public async getCurrentBranch(repoPath: string): Promise<string> {
    try {
      return new Promise((resolve, reject) => {
        const gitProcess = spawn('git', ['branch', '--show-current'], {
          cwd: repoPath,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdOutput = '';
        let errorOutput = '';

        gitProcess.stdout?.on('data', (data: Buffer) => {
          stdOutput += data.toString();
        });

        gitProcess.stderr?.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });

        gitProcess.on('close', (code: number) => {
          if (code === 0) {
            const branchName = stdOutput.trim() || 'unknown';
            resolve(branchName);
          } else {
            this.gitOutputChannel.appendLine(`[Git] Get current branch failed: ${errorOutput}`);
            reject(new Error(`获取当前分支失败: ${errorOutput}`));
          }
        });

        gitProcess.on('error', (error: Error) => {
          this.gitOutputChannel.appendLine(`[Git] Get current branch process error: ${error.message}`);
          reject(error);
        });
      });
    } catch (error) {
      this.gitOutputChannel.appendLine(`[Git] Get current branch failed: ${error}`);
      throw new Error(`获取当前分支失败: ${error}`);
    }
  }

  /**
   * 获取本地分支列表 - 使用 native Git 命令
   */
  public async getLocalBranches(repoPath: string): Promise<string[]> {
    try {
      return new Promise((resolve, reject) => {
        const gitProcess = spawn('git', ['branch', '--format=%(refname:short)'], {
          cwd: repoPath,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdOutput = '';
        let errorOutput = '';

        gitProcess.stdout?.on('data', (data: Buffer) => {
          stdOutput += data.toString();
        });

        gitProcess.stderr?.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });

        gitProcess.on('close', (code: number) => {
          if (code === 0) {
            const branches = stdOutput.trim().split('\n').filter(branch => branch.length > 0);
            resolve(branches);
          } else {
            this.gitOutputChannel.appendLine(`[Git] Get local branches failed: ${errorOutput}`);
            reject(new Error(`获取本地分支失败: ${errorOutput}`));
          }
        });

        gitProcess.on('error', (error: Error) => {
          this.gitOutputChannel.appendLine(`[Git] Get local branches process error: ${error.message}`);
          reject(error);
        });
      });
    } catch (error) {
      this.gitOutputChannel.appendLine(`[Git] Get local branches failed: ${error}`);
      throw new Error(`获取本地分支失败: ${error}`);
    }
  }

  /**
   * 获取远程分支列表 - 使用 native Git 命令
   */
  public async getRemoteBranches(repoPath: string): Promise<string[]> {
    try {
      return new Promise((resolve, reject) => {
        const gitProcess = spawn('git', ['branch', '-r', '--format=%(refname:short)'], {
          cwd: repoPath,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdOutput = '';
        let errorOutput = '';

        gitProcess.stdout?.on('data', (data: Buffer) => {
          stdOutput += data.toString();
        });

        gitProcess.stderr?.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });

        gitProcess.on('close', (code: number) => {
          if (code === 0) {
            const branches = stdOutput.trim().split('\n')
              .filter(branch => branch.length > 0 && !branch.includes('HEAD'));
            resolve(branches);
          } else {
            this.gitOutputChannel.appendLine(`[Git] Get remote branches failed: ${errorOutput}`);
            reject(new Error(`获取远程分支失败: ${errorOutput}`));
          }
        });

        gitProcess.on('error', (error: Error) => {
          this.gitOutputChannel.appendLine(`[Git] Get remote branches process error: ${error.message}`);
          reject(error);
        });
      });
    } catch (error) {
      this.gitOutputChannel.appendLine(`[Git] Get remote branches failed: ${error}`);
      throw new Error(`获取远程分支失败: ${error}`);
    }
  }

  /**
   * 检查仓库是否存在 - 使用 native Git 命令
   */
  public async isRepository(repoPath: string): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        const gitProcess = spawn('git', ['status'], {
          cwd: repoPath,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        gitProcess.on('close', (code: number) => {
          resolve(code === 0);
        });

        gitProcess.on('error', () => {
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取仓库状态 - 使用 native Git 命令
   */
  public async getRepositoryStatus(repoPath: string): Promise<{
    current: string;
    ahead: number;
    behind: number;
    modified: string[];
    created: string[];
    deleted: string[];
  }> {
    try {
      // 获取当前分支
      const currentBranch = await this.getCurrentBranch(repoPath);
      
      // 获取状态信息
      return new Promise((resolve, reject) => {
        const gitProcess = spawn('git', ['status', '--porcelain'], {
          cwd: repoPath,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdOutput = '';
        let errorOutput = '';

        gitProcess.stdout?.on('data', (data: Buffer) => {
          stdOutput += data.toString();
        });

        gitProcess.stderr?.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });

        gitProcess.on('close', (code: number) => {
          if (code === 0) {
            const lines = stdOutput.trim().split('\n').filter(line => line.length > 0);
            const modified: string[] = [];
            const created: string[] = [];
            const deleted: string[] = [];

            lines.forEach(line => {
              const status = line.substring(0, 2);
              const filename = line.substring(3);
              
              if (status.includes('M')) {
                modified.push(filename);
              } else if (status.includes('A') || status.includes('?')) {
                created.push(filename);
              } else if (status.includes('D')) {
                deleted.push(filename);
              }
            });

            resolve({
              current: currentBranch,
              ahead: 0, // 简化实现，不计算 ahead/behind
              behind: 0,
              modified,
              created,
              deleted
            });
          } else {
            this.gitOutputChannel.appendLine(`[Git] Get repository status failed: ${errorOutput}`);
            reject(new Error(`获取仓库状态失败: ${errorOutput}`));
          }
        });

        gitProcess.on('error', (error: Error) => {
          this.gitOutputChannel.appendLine(`[Git] Get repository status process error: ${error.message}`);
          reject(error);
        });
      });
    } catch (error) {
      this.gitOutputChannel.appendLine(`[Git] Get repository status failed: ${error}`);
      throw new Error(`获取仓库状态失败: ${error}`);
    }
  }

  /**
   * 执行自定义 Git 命令 - 使用 native Git
   */
  public async executeGitCommand(command: string, args: string[], cwd: string): Promise<string> {
    try {
      this.gitOutputChannel.appendLine(`[Git] Executing: ${command} ${args.join(' ')}`);
      this.gitOutputChannel.appendLine(`[Git] Working directory: ${cwd}`);

      return new Promise((resolve, reject) => {
        const gitProcess = spawn('git', args, {
          cwd: cwd,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdOutput = '';
        let errorOutput = '';

        gitProcess.stdout?.on('data', (data: Buffer) => {
          stdOutput += data.toString();
        });

        gitProcess.stderr?.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });

        gitProcess.on('close', (code: number) => {
          if (code === 0) {
            this.gitOutputChannel.appendLine(`[Git] Command completed successfully`);
            resolve(stdOutput);
          } else {
            this.gitOutputChannel.appendLine(`[Git] Command failed: ${errorOutput}`);
            reject(new Error(`Git 命令执行失败: ${errorOutput}`));
          }
        });

        gitProcess.on('error', (error: Error) => {
          this.gitOutputChannel.appendLine(`[Git] Command process error: ${error.message}`);
          reject(error);
        });
      });
    } catch (error) {
      this.gitOutputChannel.appendLine(`[Git] Command failed: ${error}`);
      throw new Error(`Git 命令执行失败: ${error}`);
    }
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.gitOutputChannel.dispose();
  }
}
