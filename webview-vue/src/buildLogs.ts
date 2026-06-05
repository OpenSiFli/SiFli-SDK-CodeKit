import { createApp } from 'vue';
import BuildLogsApp from './BuildLogsApp.vue';
import { initializeVSCodeApi } from './utils/vsCodeApi';
import '@xterm/xterm/css/xterm.css';
import './styles/buildLogs.css';

initializeVSCodeApi();

createApp(BuildLogsApp).mount('#app');
