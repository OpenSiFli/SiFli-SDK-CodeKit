import * as vscode from 'vscode';
import * as path from 'path';
import { SCONSCRIPT_FILE, PROJECT_SUBFOLDER, SRC_SUBFOLDER } from '../constants';
import { fileExists, isDirectory } from './fileUtils';

/**
 * 检查当前工作区是否为 SiFli 项目
 */
export function isSiFliProject(): boolean {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  
  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.log('[ProjectUtils] No workspace folders found');
    return false;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  
  // 检查是否存在 project 子文件夹
  const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);
  if (!isDirectory(projectPath)) {
    console.log(`[ProjectUtils] Project directory not found: ${projectPath}`);
    return false;
  }

  // 检查 project 目录下是否存在 SConscript 文件
  const sconscriptPath = path.join(projectPath, SCONSCRIPT_FILE);
  if (!fileExists(sconscriptPath)) {
    console.log(`[ProjectUtils] SConscript file not found: ${sconscriptPath}`);
    return false;
  }

  // 检查是否存在 src 子文件夹
  const srcPath = path.join(projectPath, SRC_SUBFOLDER);
  if (!isDirectory(srcPath)) {
    console.log(`[ProjectUtils] Source directory not found: ${srcPath}`);
    return false;
  }

  console.log('[ProjectUtils] SiFli project detected');
  return true;
}

/**
 * 获取项目信息
 */
export function getProjectInfo(): {
  workspaceRoot: string;
  projectPath: string;
  srcPath: string;
  sconscriptPath: string;
} | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const projectPath = path.join(workspaceRoot, PROJECT_SUBFOLDER);
  const srcPath = path.join(projectPath, SRC_SUBFOLDER);
  const sconscriptPath = path.join(projectPath, SCONSCRIPT_FILE);

  return {
    workspaceRoot,
    projectPath,
    srcPath,
    sconscriptPath
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
  const projectInfo = getProjectInfo();

  if (!projectInfo) {
    return {
      isValid: false,
      missingParts: ['workspace']
    };
  }

  if (!isDirectory(projectInfo.projectPath)) {
    missingParts.push('project directory');
  }

  if (!fileExists(projectInfo.sconscriptPath)) {
    missingParts.push('SConscript file');
  }

  if (!isDirectory(projectInfo.srcPath)) {
    missingParts.push('src directory');
  }

  return {
    isValid: missingParts.length === 0,
    missingParts
  };
}
