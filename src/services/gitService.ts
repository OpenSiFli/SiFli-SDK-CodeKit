import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChildProcess, spawn } from 'child_process';
import axios from 'axios';
import { GitSdkMetadata, SdkBranch, SdkRelease } from '../types';
import { GIT_REPOS } from '../constants';

type ProgressSource = 'stdout' | 'stderr';

interface GitCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  onProgress?: (line: string, source: ProgressSource) => void;
}

interface GitCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

class GitCommandError extends Error {
  public readonly code: number | null;
  public readonly stdout: string;
  public readonly stderr: string;

  constructor(message: string, code: number | null, stdout: string, stderr: string) {
    super(message);
    this.name = 'GitCommandError';
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export class GitService {
  private static instance: GitService;
  private readonly gitOutputChannel: vscode.OutputChannel;
  private readonly activeProcesses = new Map<string, ChildProcess>();

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

  public terminateAllProcesses(): void {
    this.gitOutputChannel.appendLine(`[Git] Terminating ${this.activeProcesses.size} active processes...`);

    for (const [processId, process] of this.activeProcesses) {
      try {
        if (!process.killed) {
          this.gitOutputChannel.appendLine(`[Git] Killing process ${processId}...`);
          process.kill('SIGTERM');

          setTimeout(() => {
            if (!process.killed) {
              this.gitOutputChannel.appendLine(`[Git] Force killing process ${processId}...`);
              process.kill('SIGKILL');
            }
          }, 3000);
        }
      } catch (error) {
        this.gitOutputChannel.appendLine(`[Git] Error terminating process ${processId}: ${String(error)}`);
      }
    }

    this.activeProcesses.clear();
  }

  public async isGitInstalled(): Promise<boolean> {
    try {
      await this.runGit(['--version'], { timeoutMs: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  public async fetchSiFliSdkReleases(source: 'github' | 'gitee'): Promise<SdkRelease[]> {
    try {
      const apiUrl =
        source === 'github' ? `${GIT_REPOS.GITHUB.API_BASE}/releases` : `${GIT_REPOS.GITEE.API_BASE}/releases`;

      const response = await axios.get(apiUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'SiFli-SDK-CodeKit',
        },
      });

      if (source === 'github') {
        return response.data.map((release: any) => ({
          tagName: release.tag_name,
          name: release.name,
          publishedAt: release.published_at,
          prerelease: release.prerelease || false,
        }));
      }

      return response.data.map((release: any) => ({
        tagName: release.tag_name,
        name: release.name,
        publishedAt: release.created_at,
        prerelease: false,
      }));
    } catch (error) {
      this.gitOutputChannel.appendLine(`[Git] Failed to fetch releases from ${source}: ${String(error)}`);
      throw new Error(`无法获取 ${source} 发布版本: ${String(error)}`);
    }
  }

  public async fetchSiFliSdkBranches(source: 'github' | 'gitee'): Promise<SdkBranch[]> {
    try {
      const apiUrl =
        source === 'github' ? `${GIT_REPOS.GITHUB.API_BASE}/branches` : `${GIT_REPOS.GITEE.API_BASE}/branches`;

      const response = await axios.get(apiUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'SiFli-SDK-CodeKit',
        },
      });

      return response.data.map((branch: any) => ({
        name: branch.name,
        commit: {
          sha: branch.commit.sha,
          url: branch.commit.url,
        },
      }));
    } catch (error) {
      this.gitOutputChannel.appendLine(`[Git] Failed to fetch branches from ${source}: ${String(error)}`);
      throw new Error(`无法获取 ${source} 分支列表: ${String(error)}`);
    }
  }

  public async cloneRepositoryNative(
    repoUrl: string,
    localPath: string,
    options?: {
      branch?: string;
      depth?: number;
      onProgress?: (progress: string) => void;
    }
  ): Promise<void> {
    const args = ['clone', '--recursive', '--progress'];

    if (options?.branch) {
      args.push('--branch', options.branch);
    }

    if (options?.depth) {
      args.push('--depth', options.depth.toString());
    }

    args.push(repoUrl, localPath);

    await this.runGit(args, {
      onProgress: line => {
        options?.onProgress?.(line);
      },
      timeoutMs: 10 * 60 * 1000,
    });
  }

  public async cloneRepository(
    repoUrl: string,
    localPath: string,
    options?: {
      branch?: string;
      depth?: number;
      onProgress?: (progress: string) => void;
    }
  ): Promise<void> {
    const parentDir = path.dirname(localPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (fs.existsSync(localPath)) {
      fs.rmSync(localPath, { recursive: true, force: true });
    }

    let finalBranchName = options?.branch;
    if (finalBranchName === 'latest') {
      finalBranchName = 'main';
    }

    try {
      await this.cloneRepositoryNative(repoUrl, localPath, {
        ...options,
        branch: finalBranchName,
      });
    } catch (error) {
      throw new Error(`克隆仓库失败: ${this.formatError(error)}`);
    }
  }

  public async checkoutBranch(repoPath: string, branchName: string): Promise<void> {
    try {
      await this.runGit(['checkout', branchName], { cwd: repoPath });
    } catch (error) {
      throw new Error(this.formatError(error));
    }
  }

  public async pullLatest(repoPath: string): Promise<void> {
    try {
      await this.runGit(['pull'], { cwd: repoPath });
    } catch (error) {
      throw new Error(this.formatError(error));
    }
  }

  public async getCurrentBranch(repoPath: string): Promise<string> {
    const result = await this.runGit(['branch', '--show-current'], { cwd: repoPath });
    return result.stdout.trim() || 'unknown';
  }

  public async getLocalBranches(repoPath: string): Promise<string[]> {
    const result = await this.runGit(['branch', '--format=%(refname:short)'], { cwd: repoPath });
    return result.stdout
      .trim()
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);
  }

  public async getRemoteBranches(repoPath: string): Promise<string[]> {
    const result = await this.runGit(['branch', '-r', '--format=%(refname:short)'], { cwd: repoPath });
    return result.stdout
      .trim()
      .split('\n')
      .map(item => item.trim())
      .filter(item => item.length > 0 && !item.includes('HEAD'));
  }

  public async isRepository(repoPath: string): Promise<boolean> {
    try {
      const result = await this.runGit(['rev-parse', '--is-inside-work-tree'], { cwd: repoPath });
      return result.stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  public async getRepositoryStatus(repoPath: string): Promise<{
    current: string;
    ahead: number;
    behind: number;
    modified: string[];
    created: string[];
    deleted: string[];
  }> {
    const currentBranch = await this.getCurrentBranch(repoPath);
    const result = await this.runGit(['status', '--porcelain'], { cwd: repoPath });

    const modified: string[] = [];
    const created: string[] = [];
    const deleted: string[] = [];

    result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .forEach(line => {
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

    return {
      current: currentBranch,
      ahead: 0,
      behind: 0,
      modified,
      created,
      deleted,
    };
  }

  public async executeGitCommand(command: string, args: string[], cwd: string): Promise<string> {
    if (command !== 'git') {
      throw new Error(`Unsupported git command executable: ${command}`);
    }

    const result = await this.runGit(args, { cwd });
    return result.stdout;
  }

  public async getSdkMetadata(repoPath: string): Promise<GitSdkMetadata> {
    const isGitRepo = await this.isRepository(repoPath);
    if (!isGitRepo) {
      return {
        isGitRepo: false,
        ref: 'non-git',
        refType: 'unknown',
        hash: '',
        isDirty: false,
      };
    }

    const branchName = await this.tryGetOutput(repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const exactTag = await this.tryGetOutput(repoPath, ['describe', '--tags', '--exact-match']);
    const hash = (await this.runGit(['rev-parse', 'HEAD'], { cwd: repoPath })).stdout.trim();
    const status = (await this.runGit(['status', '--porcelain'], { cwd: repoPath })).stdout.trim();
    const trackedBranchRaw = await this.tryGetOutput(repoPath, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}',
    ]);
    const origin = await this.tryGetOutput(repoPath, ['remote', 'get-url', 'origin']);

    let ref = 'detached';
    let refType: GitSdkMetadata['refType'] = 'detached';

    if (branchName) {
      ref = branchName;
      refType = 'branch';
    } else if (exactTag) {
      ref = exactTag;
      refType = 'tag';
    }

    return {
      isGitRepo: true,
      ref,
      refType,
      hash,
      isDirty: status.length > 0,
      trackedBranch: trackedBranchRaw || undefined,
      origin: origin || undefined,
      branchName: branchName || undefined,
      exactTag: exactTag || undefined,
    };
  }

  public async localBranchExists(repoPath: string, branchName: string): Promise<boolean> {
    try {
      await this.runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], { cwd: repoPath });
      return true;
    } catch {
      return false;
    }
  }

  public async fetchOrigin(
    repoPath: string,
    refspecs: string[] = [],
    onProgress?: (line: string) => void
  ): Promise<void> {
    await this.runGit(['fetch', '--prune', '--tags', 'origin', ...refspecs], {
      cwd: repoPath,
      onProgress: line => onProgress?.(line),
      timeoutMs: 10 * 60 * 1000,
    });
  }

  public async checkoutRef(repoPath: string, ref: string, onProgress?: (line: string) => void): Promise<void> {
    await this.runGit(['checkout', ref], {
      cwd: repoPath,
      onProgress: line => onProgress?.(line),
      timeoutMs: 10 * 60 * 1000,
    });
  }

  public async checkoutOrCreateTrackingBranch(
    repoPath: string,
    branchName: string,
    onProgress?: (line: string) => void
  ): Promise<void> {
    const exists = await this.localBranchExists(repoPath, branchName);
    const args = exists ? ['checkout', branchName] : ['checkout', '-b', branchName, '--track', `origin/${branchName}`];

    await this.runGit(args, {
      cwd: repoPath,
      onProgress: line => onProgress?.(line),
      timeoutMs: 10 * 60 * 1000,
    });
  }

  public async mergeFastForward(repoPath: string, target: string, onProgress?: (line: string) => void): Promise<void> {
    await this.runGit(['merge', '--ff-only', target], {
      cwd: repoPath,
      onProgress: line => onProgress?.(line),
      timeoutMs: 10 * 60 * 1000,
    });
  }

  public async syncSubmodules(repoPath: string, onProgress?: (line: string) => void): Promise<void> {
    await this.runGit(['submodule', 'sync', '--recursive'], {
      cwd: repoPath,
      onProgress: line => onProgress?.(line),
      timeoutMs: 10 * 60 * 1000,
    });

    await this.runGit(['submodule', 'update', '--init', '--recursive'], {
      cwd: repoPath,
      onProgress: line => onProgress?.(line),
      timeoutMs: 10 * 60 * 1000,
    });
  }

  public async updateBranchToLatest(
    repoPath: string,
    branchName: string,
    onProgress?: (line: string) => void
  ): Promise<void> {
    const metadata = await this.getSdkMetadata(repoPath);
    if (metadata.isDirty) {
      throw new Error('本地工作区有未提交改动，无法更新分支。');
    }

    await this.fetchOrigin(repoPath, [branchName], onProgress);
    await this.mergeFastForward(repoPath, 'FETCH_HEAD', onProgress);
    await this.syncSubmodules(repoPath, onProgress);
  }

  public async switchToBranchRef(
    repoPath: string,
    branchName: string,
    onProgress?: (line: string) => void
  ): Promise<void> {
    await this.fetchOrigin(repoPath, [], onProgress);
    await this.checkoutOrCreateTrackingBranch(repoPath, branchName, onProgress);
    await this.mergeFastForward(repoPath, `origin/${branchName}`, onProgress);
    await this.syncSubmodules(repoPath, onProgress);
  }

  public async switchToTagRef(repoPath: string, tagRef: string, onProgress?: (line: string) => void): Promise<void> {
    await this.fetchOrigin(repoPath, [], onProgress);

    const normalizedTagRef = tagRef.startsWith('refs/tags/') ? tagRef : `refs/tags/${tagRef}`;
    await this.checkoutRef(repoPath, normalizedTagRef, onProgress);
    await this.syncSubmodules(repoPath, onProgress);
  }

  public async commitExists(repoPath: string, ref: string): Promise<boolean> {
    try {
      await this.runGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: repoPath });
      return true;
    } catch {
      return false;
    }
  }

  public async isCommitAncestor(repoPath: string, ancestorCommit: string, descendantRef = 'HEAD'): Promise<boolean> {
    try {
      await this.runGit(['merge-base', '--is-ancestor', ancestorCommit, descendantRef], { cwd: repoPath });
      return true;
    } catch (error) {
      if (error instanceof GitCommandError && error.code === 1) {
        return false;
      }
      throw error;
    }
  }

  public dispose(): void {
    this.terminateAllProcesses();
    this.gitOutputChannel.dispose();
  }

  private async runGit(args: string[], options: GitCommandOptions = {}): Promise<GitCommandResult> {
    const processId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const timeoutMs = options.timeoutMs ?? 30_000;

    this.gitOutputChannel.appendLine(`[Git] git ${args.join(' ')}${options.cwd ? ` (cwd: ${options.cwd})` : ''}`);

    return new Promise((resolve, reject) => {
      const gitProcess = spawn('git', args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcesses.set(processId, gitProcess);

      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = (handler: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        this.removeProcess(processId);
        handler();
      };

      const pushOutput = (chunk: Buffer, source: ProgressSource) => {
        const content = chunk.toString();

        if (source === 'stdout') {
          stdout += content;
        } else {
          stderr += content;
        }

        content
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean)
          .forEach(line => {
            this.gitOutputChannel.appendLine(`[Git:${source}] ${line}`);
            options.onProgress?.(line, source);
          });
      };

      gitProcess.stdout?.on('data', (chunk: Buffer) => pushOutput(chunk, 'stdout'));
      gitProcess.stderr?.on('data', (chunk: Buffer) => pushOutput(chunk, 'stderr'));

      gitProcess.on('close', code => {
        finish(() => {
          if (code === 0) {
            resolve({ stdout, stderr, code: code ?? 0 });
            return;
          }

          const message = stderr.trim() || stdout.trim() || `git ${args.join(' ')} failed with exit code ${code}`;
          reject(new GitCommandError(message, code, stdout, stderr));
        });
      });

      gitProcess.on('error', error => {
        finish(() => {
          reject(new GitCommandError(error.message, null, stdout, stderr));
        });
      });

      const timeout = setTimeout(() => {
        if (!gitProcess.killed) {
          gitProcess.kill('SIGTERM');
        }

        finish(() => {
          reject(new GitCommandError(`git ${args.join(' ')} timed out after ${timeoutMs}ms`, null, stdout, stderr));
        });
      }, timeoutMs);
    });
  }

  private removeProcess(processId: string): void {
    this.activeProcesses.delete(processId);
  }

  private async tryGetOutput(repoPath: string, args: string[]): Promise<string> {
    try {
      const result = await this.runGit(args, { cwd: repoPath });
      return result.stdout.trim();
    } catch {
      return '';
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof GitCommandError) {
      return error.stderr.trim() || error.stdout.trim() || error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
