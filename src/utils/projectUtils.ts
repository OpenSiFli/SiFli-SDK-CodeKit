import * as vscode from 'vscode';
import * as path from 'path';
import {
  HCPU_SUBFOLDER,
  LCPU_SUBFOLDER,
  PROJECT_SUBFOLDER,
  SCONSCRIPT_FILE,
  SRC_SUBFOLDER
} from '../constants';
import { fileExists, isDirectory } from './fileUtils';

function getWorkspaceRootPath(): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }
  return workspaceFolders[0].uri.fsPath;
}

function resolveProjectEntry(
  projectPath: string
): { projectEntryPath: string; sconscriptPath: string } | null {
  const projectCandidates = [
    path.join(projectPath, HCPU_SUBFOLDER),
    path.join(projectPath, LCPU_SUBFOLDER),
    projectPath
  ];

  for (const candidate of projectCandidates) {
    const sconscriptPath = path.join(candidate, SCONSCRIPT_FILE);
    if (fileExists(sconscriptPath)) {
      return {
        projectEntryPath: candidate,
        sconscriptPath
      };
    }
  }

  return null;
}

function getSconscriptCandidatePaths(projectPath: string): string[] {
  return [
    path.join(projectPath, SCONSCRIPT_FILE),
    path.join(projectPath, HCPU_SUBFOLDER, SCONSCRIPT_FILE),
    path.join(projectPath, LCPU_SUBFOLDER, SCONSCRIPT_FILE)
  ];
}

/**
 * 检查当前工作区是否为 SiFli 项目
 */
export function isSiFliProject(): boolean {
  const workspaceRoot = getWorkspaceRootPath();

  if (!workspaceRoot) {
    console.log('[ProjectUtils] No workspace folders found');
    return false;
  }

  // 检查是否存在 project 子文件夹
  const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);
  if (!isDirectory(projectPath)) {
    console.log(`[ProjectUtils] Project directory not found: ${projectPath}`);
    return false;
  }

  const projectEntry = resolveProjectEntry(projectPath);
  if (!projectEntry) {
    const candidatePaths = getSconscriptCandidatePaths(projectPath).join(', ');
    console.log(`[ProjectUtils] SConscript file not found. Checked: ${candidatePaths}`);
    return false;
  }

  // 检查是否存在 src 子文件夹（在工作区根目录下）
  const srcPath = path.join(workspaceRoot, SRC_SUBFOLDER);
  if (!isDirectory(srcPath)) {
    console.log(`[ProjectUtils] Source directory not found: ${srcPath}`);
    return false;
  }

  const entryType = path.relative(projectPath, projectEntry.projectEntryPath) || 'root';
  console.log(`[ProjectUtils] SiFli project detected. Entry: ${entryType}`);
  return true;
}

/**
 * 获取项目信息
 */
export function getProjectInfo(): {
  workspaceRoot: string;
  projectPath: string;
  srcPath: string;
  projectEntryPath: string;
  projectEntryRelativePath: string;
  sconscriptPath: string;
} | null {
  const workspaceRoot = getWorkspaceRootPath();

  if (!workspaceRoot) {
    return null;
  }

  const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);
  const srcPath = path.join(workspaceRoot, SRC_SUBFOLDER);
  const projectEntry = resolveProjectEntry(projectPath);

  if (!projectEntry) {
    return null;
  }

  const projectEntryRelativePath = path.relative(workspaceRoot, projectEntry.projectEntryPath);

  return {
    workspaceRoot,
    projectPath,
    srcPath,
    projectEntryPath: projectEntry.projectEntryPath,
    projectEntryRelativePath,
    sconscriptPath: projectEntry.sconscriptPath
  };
}

/**
 * 验证项目结构完整性
 */
export function validateProjectStructure(): {
  isValid: boolean;
  missingParts: string[];
} {
  const missingParts: string[] = [];
  const workspaceRoot = getWorkspaceRootPath();

  if (!workspaceRoot) {
    return {
      isValid: false,
      missingParts: ['workspace']
    };
  }

  const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);
  const srcPath = path.join(workspaceRoot, SRC_SUBFOLDER);

  if (!isDirectory(projectPath)) {
    missingParts.push('project directory');
  }

  const projectEntry = resolveProjectEntry(projectPath);
  if (!projectEntry) {
    missingParts.push('SConscript file');
  }

  if (!isDirectory(srcPath)) {
    missingParts.push('src directory');
  }

  return {
    isValid: missingParts.length === 0,
    missingParts
  };
}
