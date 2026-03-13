<template>
  <div class="min-h-screen bg-vscode-background text-vscode-foreground">
    <div class="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8">
      <header class="rounded-2xl border border-vscode-panel-border bg-vscode-background/95 px-5 py-5 shadow-sm">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.32em] text-vscode-input-placeholder">SiFli SDK CodeKit</p>
            <div>
              <h1 class="text-2xl font-semibold tracking-tight">SDK 管理台</h1>
              <p class="text-sm text-vscode-input-placeholder">
                查看本地 SDK 状态，执行版本切换、更新、重命名和工具更新。
              </p>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 lg:min-w-[24rem]">
            <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/40 px-4 py-3">
              <p class="text-xs uppercase tracking-[0.24em] text-vscode-input-placeholder">当前 SDK</p>
              <p class="mt-2 text-sm font-medium">{{ catalogStore.currentSdk?.name || '未激活' }}</p>
              <p class="mt-1 break-all text-xs text-vscode-input-placeholder">
                {{ catalogStore.currentSdk?.ref || '等待刷新' }}
              </p>
            </div>
            <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/40 px-4 py-3">
              <p class="text-xs uppercase tracking-[0.24em] text-vscode-input-placeholder">运行中任务</p>
              <p class="mt-2 text-sm font-medium">{{ runningTaskCount }}</p>
              <p class="mt-1 text-xs text-vscode-input-placeholder">长任务日志会保留在任务页中。</p>
            </div>
          </div>
        </div>

        <nav class="mt-5 flex flex-wrap gap-2">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="rounded-full border px-4 py-2 text-sm transition-colors"
            :class="route.path === item.to ? activeNavClass : inactiveNavClass"
          >
            {{ item.label }}
          </RouterLink>
        </nav>
      </header>

      <div v-if="catalogStore.bannerMessage" class="mt-4 rounded-2xl border px-4 py-3 text-sm" :class="bannerClass">
        <div class="flex items-start justify-between gap-3">
          <p>{{ catalogStore.bannerMessage }}</p>
          <button
            class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder"
            @click="catalogStore.clearBanner()"
          >
            关闭
          </button>
        </div>
      </div>

      <main class="flex-1 py-6">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useSdkCatalogStore } from '@/stores/sdkCatalog';
import { useTaskCenterStore } from '@/stores/taskCenter';

const route = useRoute();
const catalogStore = useSdkCatalogStore();
const taskCenterStore = useTaskCenterStore();

onMounted(() => {
  if (catalogStore.sdks.length === 0) {
    catalogStore.fetchList();
  }
});

const navItems = [
  { to: '/', label: '总览' },
  { to: '/install', label: '安装与导入' },
];

const runningTaskCount = computed(() => taskCenterStore.sortedTasks.filter(task => task.status === 'running').length);

const activeNavClass = 'border-vscode-focus-border bg-vscode-button-background text-vscode-button-foreground shadow-sm';
const inactiveNavClass =
  'border-vscode-panel-border bg-vscode-background text-vscode-foreground hover:border-vscode-focus-border hover:bg-vscode-input-background';

const bannerClass = computed(() => {
  switch (catalogStore.bannerLevel) {
    case 'error':
      return 'border-red-500/40 bg-red-500/10 text-red-200';
    case 'warn':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-100';
    default:
      return 'border-vscode-panel-border bg-vscode-input-background text-vscode-foreground';
  }
});
</script>
