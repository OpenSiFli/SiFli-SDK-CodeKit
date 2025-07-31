import { ref, onMounted, onUnmounted } from 'vue';
import type { VSCodeApi, WebviewMessage } from '@/types';

declare global {
  function acquireVsCodeApi(): VSCodeApi;
}

export function useVsCodeApi() {
  const vscode = ref<VSCodeApi | null>(null);
  const messageHandlers = ref<Map<string, (data: any) => void>>(new Map());

  onMounted(() => {
    try {
      vscode.value = acquireVsCodeApi();
      
      // 监听来自扩展的消息
      window.addEventListener('message', handleMessage);
    } catch (error) {
      console.error('Failed to acquire VS Code API:', error);
    }
  });

  onUnmounted(() => {
    window.removeEventListener('message', handleMessage);
  });

  const handleMessage = (event: MessageEvent) => {
    const message = event.data as WebviewMessage;
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

  return {
    vscode,
    postMessage,
    onMessage,
    offMessage,
    getState,
    setState
  };
}
