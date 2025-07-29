import * as fs from 'fs';
import * as path from 'path';

/**
 * 检查文件是否存在
 */
export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

/**
 * 检查是否为目录
 */
export function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * 检查是否为文件
 */
export function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
}

/**
 * 读取 JSON 文件
 */
export function readJsonFile<T = any>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`Error reading JSON file ${filePath}:`, error);
    return null;
  }
}

/**
 * 写入 JSON 文件
 */
export function writeJsonFile(filePath: string, data: any): boolean {
  try {
    const jsonContent = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, jsonContent, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing JSON file ${filePath}:`, error);
    return false;
  }
}

/**
 * 读取文本文件
 */
export function readTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Error reading text file ${filePath}:`, error);
    return null;
  }
}

/**
 * 写入文本文件
 */
export function writeTextFile(filePath: string, content: string): boolean {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing text file ${filePath}:`, error);
    return false;
  }
}

/**
 * 创建目录（递归）
 */
export function createDirectory(dirPath: string): boolean {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  } catch (error) {
    console.error(`Error creating directory ${dirPath}:`, error);
    return false;
  }
}

/**
 * 删除文件或目录
 */
export function deleteFileOrDirectory(filePath: string): boolean {
  try {
    fs.rmSync(filePath, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error(`Error deleting ${filePath}:`, error);
    return false;
  }
}

/**
 * 获取目录中的文件列表
 */
export function getDirectoryContents(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath);
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
    return [];
  }
}

/**
 * 获取文件大小
 */
export function getFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch (error) {
    console.error(`Error getting file size ${filePath}:`, error);
    return 0;
  }
}

/**
 * 获取文件修改时间
 */
export function getFileModTime(filePath: string): Date | null {
  try {
    return fs.statSync(filePath).mtime;
  } catch (error) {
    console.error(`Error getting file modification time ${filePath}:`, error);
    return null;
  }
}

/**
 * 复制文件
 */
export function copyFile(src: string, dest: string): boolean {
  try {
    fs.copyFileSync(src, dest);
    return true;
  } catch (error) {
    console.error(`Error copying file from ${src} to ${dest}:`, error);
    return false;
  }
}
