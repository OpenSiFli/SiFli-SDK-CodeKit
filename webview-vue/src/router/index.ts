import { createRouter, createWebHashHistory } from 'vue-router';
import OverviewPage from '@/views/OverviewPage.vue';
import InstallPage from '@/views/InstallPage.vue';
import ImportSdkPage from '@/views/ImportSdkPage.vue';
import SdkDetailPage from '@/views/SdkDetailPage.vue';
import TaskPage from '@/views/TaskPage.vue';

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
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
});
