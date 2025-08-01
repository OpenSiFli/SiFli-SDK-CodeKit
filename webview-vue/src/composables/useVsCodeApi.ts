import { ref, onMounted, onUnmounted } from 'vue';
import { setLocale, type SupportedLocale, supportedLocales } from '@/i18n';
import { getVSCodeApiInstance } from '@/utils/vsCodeApi';
import type { VSCodeApi, WebviewMessage } from '@/types';

// 全局单例
let isInitialized = false;
let messageEventListener: ((event: MessageEvent) => void) | null = null;
let globalMessageHandlers: Map<string, Set<(data: any) => void>> = new Map();

// 简化的获取 VS Code API 函数
function getVSCodeApi(): VSCodeApi | null {
  const api = getVSCodeApiInstance();
  if (api) {
    console.log('[useVsCodeApi] VS Code API available');
    return api;
  } else {
    console.error('[useVsCodeApi] VS Code API not available');
    return null;
  }
}

export function useVsCodeApi() {
  const vscode = ref<VSCodeApi | null>(null);
  const messageHandlers = ref<Map<string, (data: any) => void>>(new Map());
  const isReady = ref(false);

  onMounted(() => {
    // 获取 VS Code API 实例
    const apiInstance = getVSCodeApi();
    if (apiInstance) {
      vscode.value = apiInstance;
      console.log('[useVsCodeApi] VS Code API ready');
    } else {
      console.error('[useVsCodeApi] Unable to get VS Code API instance');
      return;
    }
      
    // 避免重复添加事件监听器
    if (!isInitialized) {
      messageEventListener = handleMessage;
      window.addEventListener('message', messageEventListener);
      isInitialized = true;
      console.log('[useVsCodeApi] Message listener attached');
      
      // 通知 VS Code 我们已准备好
      postMessage({ command: 'ready' });
    }
  });

  onUnmounted(() => {
    // 移除当前组件注册的处理器
    messageHandlers.value.forEach((handler, command) => {
      const handlersSet = globalMessageHandlers.get(command);
      if (handlersSet) {
        handlersSet.delete(handler);
        if (handlersSet.size === 0) {
          globalMessageHandlers.delete(command);
        }
      }
    });
    messageHandlers.value.clear();
  });

  const handleMessage = (event: MessageEvent) => {
    const message = event.data as WebviewMessage;
    
    // 处理语言相关消息
    switch (message.command) {
      case 'initializeLocale':
        console.log('[useVsCodeApi] Received initial locale:', message.locale);
        const initLocale = message.locale as SupportedLocale;
        if (supportedLocales.includes(initLocale)) {
          setLocale(initLocale);
        }
        isReady.value = true;
        break;
        
      case 'localeChanged':
        console.log('[useVsCodeApi] VS Code locale changed:', message.locale);
        const newLocale = message.locale as SupportedLocale;
        if (supportedLocales.includes(newLocale)) {
          setLocale(newLocale);
        }
        break;
    }
    
    // 调用所有注册的处理器
    const handlersSet = globalMessageHandlers.get(message.command);
    if (handlersSet) {
      handlersSet.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error(`Error in message handler for ${message.command}:`, error);
        }
      });
    }
  };

  const postMessage = (message: WebviewMessage) => {
    if (vscode.value) {
      vscode.value.postMessage(message);
    } else {
      console.warn('VS Code API not available');
    }
  };

  const onMessage = (command: string, handler: (data: any) => void) => {
    // 注册到本地映射
    messageHandlers.value.set(command, handler);
    
    // 注册到全局映射
    if (!globalMessageHandlers.has(command)) {
      globalMessageHandlers.set(command, new Set());
    }
    globalMessageHandlers.get(command)!.add(handler);
  };

  const offMessage = (command: string) => {
    const handler = messageHandlers.value.get(command);
    if (handler) {
      messageHandlers.value.delete(command);
      
      // 从全局映射中移除
      const handlersSet = globalMessageHandlers.get(command);
      if (handlersSet) {
        handlersSet.delete(handler);
        if (handlersSet.size === 0) {
          globalMessageHandlers.delete(command);
        }
      }
    }
  };

  const getState = () => {
    return vscode.value?.getState();
  };

  const setState = (state: any) => {
    vscode.value?.setState(state);
  };

  // 通知 VS Code 语言变化
  const notifyLocaleChange = (locale: SupportedLocale) => {
    postMessage({
      command: 'localeChanged',
      locale: locale
    });
  };

  return {
    vscode,
    isReady,
    postMessage,
    onMessage,
    offMessage,
    getState,
    setState,
    notifyLocaleChange
  };
}
