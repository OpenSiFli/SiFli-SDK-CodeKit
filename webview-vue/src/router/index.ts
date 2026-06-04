import { createRouter, createWebHashHistory } from 'vue-router';
import OverviewPage from '@/views/OverviewPage.vue';
import InstallPage from '@/views/InstallPage.vue';
import ImportSdkPage from '@/views/ImportSdkPage.vue';
import SdkDetailPage from '@/views/SdkDetailPage.vue';
import TaskPage from '@/views/TaskPage.vue';
import AnalysisPage from '@/views/AnalysisPage.vue';
import DebugSnapshotPage from '@/views/DebugSnapshotPage.vue';
import MenuconfigPage from '@/views/MenuconfigPage.vue';
import SerialMonitorPage from '@/views/SerialMonitorPage.vue';
import MemoryMapPage from '@/views/MemoryMapPage.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'overview',
      component: OverviewPage,
    },
    {
      path: '/install',
      name: 'install',
      component: InstallPage,
    },
    {
      path: '/import',
      name: 'import',
      component: ImportSdkPage,
    },
    {
      path: '/sdk/:sdkId',
      name: 'sdk-detail',
      component: SdkDetailPage,
      props: true,
    },
    {
      path: '/tasks/:taskId',
      name: 'task',
      component: TaskPage,
      props: true,
    },
    {
      path: '/analysis',
      name: 'analysis',
      component: AnalysisPage,
    },
    {
      path: '/debug-snapshot',
      name: 'debug-snapshot',
      component: DebugSnapshotPage,
    },
    {
      path: '/serial-monitor',
      name: 'serial-monitor',
      component: SerialMonitorPage,
    },
    {
      path: '/menuconfig',
      name: 'menuconfig',
      component: MenuconfigPage,
    },
    {
      path: '/memory-map',
      name: 'memory-map',
      component: MemoryMapPage,
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
});
