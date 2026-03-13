<template>
  <section class="space-y-6">
    <div class="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
        <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">Overview</p>
        <h2 class="mt-3 text-3xl font-semibold tracking-tight">已安装 SDK</h2>
        <p class="mt-2 max-w-2xl text-sm text-vscode-input-placeholder">
          在同一个视图中查看本地 SDK 的真实 Git 状态，直接执行激活、分支更新和工具更新。
        </p>
        <div class="mt-5 flex flex-wrap gap-3">
          <BaseButton variant="primary" @click="catalogStore.fetchList()">刷新列表</BaseButton>
          <BaseButton variant="secondary" @click="router.push('/install')">安装或导入 SDK</BaseButton>
        </div>
      </div>

      <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-input-background/40 px-6 py-6 shadow-sm">
        <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">Current</p>
        <template v-if="catalogStore.currentSdk">
          <h3 class="mt-3 text-xl font-semibold">{{ catalogStore.currentSdk.name }}</h3>
          <p class="mt-2 break-all text-sm">{{ catalogStore.currentSdk.ref }}</p>
          <p class="mt-3 break-all text-xs text-vscode-input-placeholder">{{ catalogStore.currentSdk.hash }}</p>
        </template>
        <template v-else>
          <h3 class="mt-3 text-xl font-semibold">尚未激活 SDK</h3>
          <p class="mt-2 text-sm text-vscode-input-placeholder">先安装或导入一个 SDK，然后在总览页或详情页中激活它。</p>
        </template>
      </div>
    </div>

    <div
      v-if="catalogStore.listLoading"
      class="rounded-3xl border border-dashed border-vscode-panel-border px-6 py-12 text-center text-vscode-input-placeholder"
    >
      正在加载 SDK 列表...
    </div>

    <div
      v-else-if="catalogStore.sdks.length === 0"
      class="rounded-3xl border border-dashed border-vscode-panel-border px-6 py-12 text-center"
    >
      <h3 class="text-xl font-semibold">还没有可管理的 SDK</h3>
      <p class="mt-2 text-sm text-vscode-input-placeholder">去安装页下载一个版本，或导入本地已有 SDK。</p>
      <BaseButton class="mt-5" variant="primary" @click="router.push('/install')">前往安装页</BaseButton>
    </div>

    <div v-else class="grid gap-4 xl:grid-cols-2">
      <SdkCard
        v-for="sdk in catalogStore.sdks"
        :key="sdk.id"
        :sdk="sdk"
        @view="router.push(`/sdk/${sdk.id}`)"
        @activate="catalogStore.activateSdk(sdk.id)"
        @update-branch="handleTaskRequest({ command: 'updateBranchSdk', sdkId: sdk.id })"
        @update-tools="handleTaskRequest({ command: 'rerunInstallScript', sdkId: sdk.id })"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import BaseButton from '@/components/common/BaseButton.vue';
import SdkCard from '@/components/sdk/SdkCard.vue';
import { useSdkCatalogStore } from '@/stores/sdkCatalog';
import { useTaskCenterStore } from '@/stores/taskCenter';
import type { WebviewMessage } from '@/types';

const router = useRouter();
const catalogStore = useSdkCatalogStore();
const taskCenterStore = useTaskCenterStore();

onMounted(() => {
  catalogStore.fetchList();
});

async function handleTaskRequest(message: WebviewMessage) {
  try {
    const taskId = await taskCenterStore.requestTask(message);
    await router.push(`/tasks/${taskId}`);
  } catch (error) {
    catalogStore.setBanner(error instanceof Error ? error.message : String(error), 'error');
  }
}
</script>
