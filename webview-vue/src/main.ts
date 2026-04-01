import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { i18n, initializeLocale, setupVSCodeMessageListener } from './i18n';
import { getState, initializeVsCodeBridge, onMessage, setState } from './services/vscodeBridge';
import { initializeVSCodeApi } from './utils/vsCodeApi';
import { router } from './router';
import './styles/index.css';

initializeVSCodeApi();
initializeLocale();
setupVSCodeMessageListener();
initializeVsCodeBridge();

function detectAndSetVSCodeTheme() {
  const body = document.body;
  const backgroundColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--vscode-editor-background')
    .trim();

  let isDark = false;

  if (backgroundColor.startsWith('rgb')) {
    const rgbMatch = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch.map(Number);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      isDark = brightness < 128;
    }
  }

  if (backgroundColor.startsWith('#')) {
    const hex = backgroundColor.replace('#', '');
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      isDark = brightness < 128;
    }
  }

  body.setAttribute('data-vscode-theme-kind', isDark ? 'vscode-dark' : 'vscode-light');
}

async function bootstrap() {
  detectAndSetVSCodeTheme();

  onMessage<{ route?: string }>('navigate', payload => {
    if (payload.route && payload.route !== router.currentRoute.value.fullPath) {
      void router.replace(payload.route);
    }
  });

  const savedState = getState<{ route?: string }>();

  if (savedState?.route) {
    await router.replace(savedState.route);
  }

  router.afterEach(to => {
    setState({ route: to.fullPath });
  });

  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.use(i18n);

  await router.isReady();
  app.mount('#app');
}

void bootstrap();
