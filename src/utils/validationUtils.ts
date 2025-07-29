/**
 * 验证串口路径格式
 */
export function validateSerialPortPath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }

  const trimmedPath = path.trim();
  
  // Windows: COM1, COM2, etc.
  if (/^COM\d+$/i.test(trimmedPath)) {
    return true;
  }
  
  // Unix-like: /dev/ttyUSB0, /dev/ttyACM0, /dev/cu.*, etc.
  if (/^\/dev\/(tty(USB|ACM)\d+|cu\..*)$/.test(trimmedPath)) {
    return true;
  }
  
  return false;
}

/**
 * 验证板子名称
 */
export function validateBoardName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  const trimmedName = name.trim();
  
  // 板子名称应该只包含字母、数字、下划线和连字符
  return /^[a-zA-Z0-9_-]+$/.test(trimmedName) && trimmedName.length > 0;
}

/**
 * 验证线程数
 */
export function validateThreadCount(threads: number): boolean {
  return Number.isInteger(threads) && threads > 0 && threads <= 64;
}

/**
 * 验证 SDK 版本字符串
 */
export function validateSdkVersion(version: string): boolean {
  if (!version || typeof version !== 'string') {
    return false;
  }
  
  const trimmedVersion = version.trim();
  
  // 支持语义化版本号格式：1.0.0, v1.0.0, 1.0.0-beta, etc.
  const semanticVersionRegex = /^v?(\d+)\.(\d+)\.(\d+)(-[a-zA-Z0-9.-]+)?$/;
  
  // 或者支持简单的标签名
  const tagNameRegex = /^[a-zA-Z0-9._-]+$/;
  
  return semanticVersionRegex.test(trimmedVersion) || tagNameRegex.test(trimmedVersion);
}

/**
 * 验证文件路径格式
 */
export function validateFilePath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }
  
  const trimmedPath = path.trim();
  
  // 检查路径长度
  if (trimmedPath.length === 0 || trimmedPath.length > 260) {
    return false;
  }
  
  // 检查是否包含非法字符（Windows）
  const illegalChars = /[<>:"|?*]/;
  if (process.platform === 'win32' && illegalChars.test(trimmedPath)) {
    return false;
  }
  
  return true;
}

/**
 * 验证 URL 格式
 */
export function validateUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证 Git 仓库源
 */
export function validateGitSource(source: string): source is 'github' | 'gitee' {
  return source === 'github' || source === 'gitee';
}

/**
 * 验证 Git 类型
 */
export function validateGitType(type: string): type is 'tag' | 'branch' {
  return type === 'tag' || type === 'branch';
}

/**
 * 验证输入是否为空
 */
export function validateNotEmpty(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim().length > 0;
}

/**
 * 验证数字范围
 */
export function validateNumberRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/**
 * 清理和验证板子路径
 */
export function sanitizeBoardPath(path: string): string | null {
  if (!validateFilePath(path)) {
    return null;
  }
  
  // 移除前后空格并规范化路径分隔符
  const sanitized = path.trim().replace(/[\\\/]+/g, require('path').sep);
  
  return sanitized;
}
