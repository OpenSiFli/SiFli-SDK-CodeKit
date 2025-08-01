/**
 * VS Code API 全局管理模块
 * 负责获取和管理 VS Code API 实例，供其他模块使用
 */

import type { VSCodeApi } from '@/types';

declare global {
  function acquireVsCodeApi(): VSCodeApi;
}

// 全局 VS Code API 实例
let vsCodeApiInstance: VSCodeApi | null = null;

/**
 * 获取 VS Code API 实例（只在应用启动时调用一次）
 */
export function initializeVSCodeApi(): VSCodeApi | null {
  if (vsCodeApiInstance) {
    console.log('[vsCodeApi] VS Code API already initialized');
    return vsCodeApiInstance;
  }

  try {
    if (typeof acquireVsCodeApi !== 'undefined') {
      vsCodeApiInstance = acquireVsCodeApi();
      console.log('[vsCodeApi] VS Code API initialized successfully');
      return vsCodeApiInstance;
    } else {
      console.warn('[vsCodeApi] acquireVsCodeApi function not available');
      return null;
    }
  } catch (error) {
    console.error('[vsCodeApi] Failed to initialize VS Code API:', error);
    return null;
  }
}

/**
 * 获取已初始化的 VS Code API 实例
 */
export function getVSCodeApiInstance(): VSCodeApi | null {
  return vsCodeApiInstance;
}

/**
 * 检查 VS Code API 是否可用
 */
export function isVSCodeApiAvailable(): boolean {
  return vsCodeApiInstance !== null;
}
