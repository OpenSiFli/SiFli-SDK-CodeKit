import { createApp } from 'vue';
import SdkManager from './pages/SdkManager.vue';
import '@/styles/index.css';

// 创建 Vue 应用
const app = createApp(SdkManager);

// 挂载应用
app.mount('#app');
