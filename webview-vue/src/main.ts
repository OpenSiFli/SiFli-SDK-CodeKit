import { createApp } from 'vue';
import { i18n, initializeLocale, setupVSCodeMessageListener } from './i18n';
import { initializeVSCodeApi } from './utils/vsCodeApi';
import './styles/index.css';

// 首先初始化 VS Code API（必须在其他模块之前）
initializeVSCodeApi();

// 设置 VS Code 消息监听器
setupVSCodeMessageListener();

// VS Code 主题检测和设置
function detectAndSetVSCodeTheme() {
  // 检测当前主题类型
  const body = document.body;
  
  // 通过 CSS 变量检测主题
  const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background').trim();
  const foregroundColor = getComputedStyle(document.documentElement).getPropertyValue('--vscode-foreground').trim();
  
  console.log('[Theme Debug] Background color:', backgroundColor);
  console.log('[Theme Debug] Foreground color:', foregroundColor);
  
  // 更准确的主题检测
  let isDark = false;
  let isLight = false;
  
  if (backgroundColor) {
    // 转换rgb到亮度值
    if (backgroundColor.startsWith('rgb')) {
      const rgbMatch = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch.map(Number);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        isDark = brightness < 128;
        isLight = brightness >= 128;
        console.log('[Theme Debug] RGB brightness:', brightness, isDark ? 'dark' : 'light');
      }
    } else if (backgroundColor.startsWith('#')) {
      // 十六进制颜色处理
      const hex = backgroundColor.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      isDark = brightness < 128;
      isLight = brightness >= 128;
      console.log('[Theme Debug] HEX brightness:', brightness, isDark ? 'dark' : 'light');
    } else {
      // 关键词检测
      isDark = backgroundColor.includes('30') || backgroundColor.includes('37') || backgroundColor.includes('1e') || backgroundColor.includes('25');
      isLight = backgroundColor.includes('255') || backgroundColor.includes('fff') || backgroundColor.includes('white');
    }
  }
  
  // 如果背景色检测失败，尝试前景色
  if (!isDark && !isLight && foregroundColor) {
    if (foregroundColor.startsWith('rgb')) {
      const rgbMatch = foregroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch.map(Number);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        // 前景色亮则背景色暗
        isDark = brightness > 128;
        isLight = brightness <= 128;
        console.log('[Theme Debug] Foreground brightness:', brightness, isDark ? 'dark' : 'light');
      }
    }
  }
  
  // 设置主题属性
  const currentTheme = body.getAttribute('data-vscode-theme-kind');
  const newTheme = isDark ? 'vscode-dark' : 'vscode-light';
  
  if (currentTheme !== newTheme) {
    body.setAttribute('data-vscode-theme-kind', newTheme);
    console.log('[Theme] Theme changed from', currentTheme, 'to', newTheme);
  }
  
  console.log('[Theme] Current theme:', newTheme);
  
  // 监听主题变化
  const observer = new MutationObserver(() => {
    // 延迟重新检测主题
    setTimeout(detectAndSetVSCodeTheme, 100);
  });
  
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style']
  });
}

// 初始化主题检测
detectAndSetVSCodeTheme();

// 当 DOM 加载完成后再次检测
document.addEventListener('DOMContentLoaded', detectAndSetVSCodeTheme);

// 初始化语言设置
initializeLocale();

// 获取页面类型
const urlParams = new URLSearchParams(window.location.search);
const page = urlParams.get('page') || 'sdk-manager';

// 动态导入对应的页面组件
async function loadPage() {
  let component;
  
  switch (page) {
    case 'sdk-manager':
      component = (await import('./pages/SdkManager.vue')).default;
      break;
    default:
      component = (await import('./pages/SdkManager.vue')).default;
  }
  
  const app = createApp(component);
  app.use(i18n);
  app.mount('#app');
}

loadPage();
