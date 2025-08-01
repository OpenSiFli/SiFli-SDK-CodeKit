import { createApp } from 'vue';
import { i18n, initializeLocale, setupVSCodeMessageListener } from './i18n';
import './styles/index.css';

// 设置 VS Code 消息监听器
setupVSCodeMessageListener();

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
