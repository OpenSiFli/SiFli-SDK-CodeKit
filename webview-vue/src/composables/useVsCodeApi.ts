import { ref, onMounted, onUnmounted } from 'vue';
import { setLocale, type SupportedLocale, supportedLocales } from '@/i18n';
import type { VSCodeApi, WebviewMessage } from '@/types';

declare global {
  function acquireVsCodeApi(): VSCodeApi;
}

export function useVsCodeApi() {
  const vscode = ref<VSCodeApi | null>(null);
  const messageHandlers = ref<Map<string, (data: any) => void>>(new Map());
  const isReady = ref(false);

  onMounted(() => {
    try {
      vscode.value = acquireVsCodeApi();
      
      // 监听来自扩展的消息
      window.addEventListener('message', handleMessage);
      
      // 通知 VS Code 我们已准备好
      postMessage({ command: 'ready' });
    } catch (error) {
      console.error('Failed to acquire VS Code API:', error);
    }
  });

  onUnmounted(() => {
    window.removeEventListener('message', handleMessage);
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
    
    // 调用注册的处理器
    const handler = messageHandlers.value.get(message.command);
    if (handler) {
      handler(message);
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
    messageHandlers.value.set(command, handler);
  };

  const offMessage = (command: string) => {
    messageHandlers.value.delete(command);
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
