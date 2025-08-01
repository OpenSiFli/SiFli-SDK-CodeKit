import { createI18n } from 'vue-i18n';
import { getVSCodeApiInstance } from '@/utils/vsCodeApi';

// 导入语言资源
import en from './locales/en.json';
import zh from './locales/zh.json';

// 支持的语言列表
export const supportedLocales = ['en', 'zh'] as const;
export type SupportedLocale = typeof supportedLocales[number];

// 默认语言
const defaultLocale: SupportedLocale = 'en';

// 创建 i18n 实例
export const i18n = createI18n({
  legacy: false, // 使用 Composition API 模式
  locale: defaultLocale,
  fallbackLocale: 'en',
  messages: {
    en,
    zh,
  },
});

// 设置语言的函数
export function setLocale(locale: SupportedLocale) {
  i18n.global.locale.value = locale;
  console.log('[i18n] Locale changed to:', locale);
}

// 获取当前语言
export function getCurrentLocale(): SupportedLocale {
  return i18n.global.locale.value as SupportedLocale;
}

// 初始化语言设置
export function initializeLocale() {
  // 从 VS Code 获取语言设置，如果获取不到则使用默认语言
  let locale: SupportedLocale = defaultLocale;
  
  // 通知 VS Code 我们已准备好接收初始化数据
  const vscodeApi = getVSCodeApiInstance();
  if (vscodeApi) {
    vscodeApi.postMessage({ command: 'ready' });
  } else {
    // 如果没有 VS Code API，回退到浏览器语言检测
    if (typeof window !== 'undefined') {
      const browserLang = navigator.language.toLowerCase();
      if (browserLang.startsWith('zh')) {
        locale = 'zh';
      } else {
        locale = 'en';
      }
    }
    setLocale(locale);
  }
  
  return locale;
}

// 监听来自 VS Code 的消息
export function setupVSCodeMessageListener() {
  if (typeof window !== 'undefined') {
    window.addEventListener('message', (event) => {
      const message = event.data;
      
      switch (message.command) {
        case 'initializeLocale':
        case 'localeChanged':
          const newLocale = message.locale as SupportedLocale;
          if (supportedLocales.includes(newLocale)) {
            setLocale(newLocale);
          }
          break;
      }
    });
  }
}

// 通知 VS Code 语言变化（用于手动切换语言时）
export function notifyVSCodeLocaleChange(locale: SupportedLocale) {
  const vscodeApi = getVSCodeApiInstance();
  if (vscodeApi) {
    vscodeApi.postMessage({
      command: 'localeChanged',
      locale: locale
    });
  }
}
