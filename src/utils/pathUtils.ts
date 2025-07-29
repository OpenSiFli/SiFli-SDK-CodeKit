import * as path from 'path';
import * as os from 'os';

/**
 * 获取项目根目录
 */
export function getProjectRoot(): string | null {
  const workspaceFolders = require('vscode').workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    return workspaceFolders[0].uri.fsPath;
  }
  return null;
}

/**
 * 获取项目目录路径
 */
export function getProjectPath(): string | null {
  const root = getProjectRoot();
  if (root) {
    return path.join(root, 'project');
  }
  return null;
}

/**
 * 规范化路径
 */
export function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

/**
 * 获取相对路径
 */
export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * 检查路径是否为绝对路径
 */
export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath);
}

/**
 * 解析路径中的环境变量
 */
export function resolvePathVariables(filePath: string): string {
  // 替换 ${HOME} 或 ~ 
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  
  // 替换环境变量
  return filePath.replace(/\${(\w+)}/g, (match, varName) => {
    return process.env[varName] || match;
  });
}

/**
 * 确保路径以指定分隔符结尾
 */
export function ensurePathEnding(filePath: string, ending: string = path.sep): string {
  return filePath.endsWith(ending) ? filePath : filePath + ending;
}

/**
 * 移除路径末尾的分隔符
 */
export function removePathEnding(filePath: string, ending: string = path.sep): string {
  return filePath.endsWith(ending) ? filePath.slice(0, -ending.length) : filePath;
}
