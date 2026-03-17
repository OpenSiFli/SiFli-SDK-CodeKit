import { setLocale, supportedLocales, type SupportedLocale } from '@/i18n';
import type { VSCodeApi, WebviewMessage } from '@/types';
import { getVSCodeApiInstance } from '@/utils/vsCodeApi';

type MessageHandler<T = any> = (payload: T) => void;

const handlers = new Map<string, Set<MessageHandler>>();

let initialized = false;
let readySent = false;

function dispatchMessage(message: WebviewMessage) {
  if (message.command === 'initializeLocale' || message.command === 'localeChanged') {
    const locale = message.locale as SupportedLocale;
    if (supportedLocales.includes(locale)) {
      setLocale(locale);
    }
  }

  const commandHandlers = handlers.get(message.command);
  if (!commandHandlers) {
    return;
  }

  commandHandlers.forEach(handler => {
    try {
      handler(message);
    } catch (error) {
      console.error(`[vscodeBridge] Handler failed for ${message.command}`, error);
    }
  });
}

export function initializeVsCodeBridge() {
  if (initialized) {
    return;
  }

  initialized = true;

  window.addEventListener('message', event => {
    dispatchMessage(event.data as WebviewMessage);
  });

  const api = getVSCodeApiInstance();
  if (api && !readySent) {
    readySent = true;
    api.postMessage({ command: 'ready' });
  }
}

export function postMessage(message: WebviewMessage) {
  const api = getVSCodeApiInstance();
  api?.postMessage(message);
}

export function onMessage<T = any>(command: string, handler: MessageHandler<T>) {
  if (!handlers.has(command)) {
    handlers.set(command, new Set());
  }

  handlers.get(command)!.add(handler as MessageHandler);

  return () => {
    handlers.get(command)?.delete(handler as MessageHandler);
  };
}

export function getState<T = any>(): T | undefined {
  const api = getVSCodeApiInstance();
  return api?.getState() as T | undefined;
}

export function setState(state: any) {
  const api = getVSCodeApiInstance();
  api?.setState(state);
}

export function getVsCodeApi(): VSCodeApi | null {
  return getVSCodeApiInstance();
}
