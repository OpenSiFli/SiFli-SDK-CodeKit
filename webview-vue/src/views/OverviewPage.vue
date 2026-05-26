<template>
  <section class="space-y-4">
    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-5 shadow-sm">
      <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">{{ t('overview.sectionLabel') }}</p>
      <h2 class="mt-2 text-[2rem] font-semibold tracking-tight leading-tight">{{ t('overview.title') }}</h2>
      <p class="mt-1.5 text-[0.95rem] leading-snug text-vscode-input-placeholder">
        {{ t('overview.subtitle') }}
      </p>
      <div class="mt-4 flex flex-wrap gap-2.5">
        <BaseButton variant="primary" @click="catalogStore.fetchList()">{{
          t('overview.actions.refreshList')
        }}</BaseButton>
        <BaseButton variant="secondary" @click="router.push('/install')">{{
          t('overview.actions.downloadSdk')
        }}</BaseButton>
        <BaseButton variant="secondary" @click="router.push('/import')">{{
          t('overview.actions.importSdk')
        }}</BaseButton>
      </div>
    </div>

    <div
      v-if="catalogStore.listLoading"
      class="rounded-3xl border border-dashed border-vscode-panel-border px-6 py-10 text-center text-vscode-input-placeholder"
    >
      {{ t('overview.loading') }}
    </div>

    <div
      v-else-if="catalogStore.sdks.length === 0"
      class="rounded-3xl border border-dashed border-vscode-panel-border px-6 py-10 text-center"
    >
      <h3 class="text-[1.35rem] font-semibold leading-tight">{{ t('overview.empty.title') }}</h3>
      <p class="mt-1.5 text-[0.95rem] leading-snug text-vscode-input-placeholder">
        {{ t('overview.empty.description') }}
      </p>
      <div class="mt-4 flex justify-center gap-2.5">
        <BaseButton variant="primary" @click="router.push('/install')">{{
          t('overview.actions.downloadNew')
        }}</BaseButton>
        <BaseButton variant="secondary" @click="router.push('/import')">{{
          t('overview.actions.importExisting')
        }}</BaseButton>
      </div>
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
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import BaseButton from '@/components/common/BaseButton.vue';
import SdkCard from '@/components/sdk/SdkCard.vue';
import { useSdkCatalogStore } from '@/stores/sdkCatalog';
import { useTaskCenterStore } from '@/stores/taskCenter';
import type { WebviewMessage } from '@/types';

const router = useRouter();
const { t } = useI18n();
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
