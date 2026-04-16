<template>
  <div class="min-h-screen text-vscode-foreground p-0">
    <div class="mx-auto flex w-full max-w-6xl flex-col px-4 py-8 sm:px-6">
      <header v-if="showBackButton" class="flex items-center gap-3">
        <button
          @click="router.back()"
          class="flex items-center gap-1.5 rounded-xl border border-vscode-panel-border bg-vscode-background px-4 py-2 text-base font-medium text-vscode-foreground shadow-sm transition-colors hover:bg-vscode-input-background"
        >
          ← 返回
        </button>
      </header>

      <div v-if="catalogStore.bannerMessage" class="mt-4 rounded-2xl border px-4 py-3 text-sm" :class="bannerClass">
        <div class="flex items-start justify-between gap-3">
          <p>{{ catalogStore.bannerMessage }}</p>
          <button
            class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder hover:text-vscode-foreground"
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
import { useRoute, useRouter } from 'vue-router';
import { useSdkCatalogStore } from '@/stores/sdkCatalog';

const route = useRoute();
const router = useRouter();
const catalogStore = useSdkCatalogStore();
const isStandaloneRoute = computed(() => route.name === 'analysis' || route.name === 'debug-snapshot');
const showBackButton = computed(() => route.path !== '/' && !isStandaloneRoute.value);

onMounted(() => {
  if (!isStandaloneRoute.value && catalogStore.sdks.length === 0) {
    catalogStore.fetchList();
  }
});

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
