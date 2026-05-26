<template>
  <section v-if="task" class="space-y-6">
    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">
            {{ t('taskPage.sectionLabel') }}
          </p>
          <h2 class="mt-3 text-3xl font-semibold tracking-tight">{{ task.title }}</h2>
          <p class="mt-2 text-sm text-vscode-input-placeholder">
            {{ t('taskPage.description') }}
          </p>
        </div>
        <span class="rounded-full border px-4 py-2 text-xs uppercase tracking-[0.24em]" :class="statusClass">
          {{ taskStatusLabel(task.status) }}
        </span>
      </div>

      <div class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/40 px-4 py-3">
          <p class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">
            {{ t('taskPage.fields.started') }}
          </p>
          <p class="mt-2 text-sm">{{ formatTimestamp(task.startedAt) }}</p>
        </div>
        <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/40 px-4 py-3">
          <p class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">
            {{ t('taskPage.fields.finished') }}
          </p>
          <p class="mt-2 text-sm">{{ task.finishedAt ? formatTimestamp(task.finishedAt) : t('taskPage.running') }}</p>
        </div>
        <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/40 px-4 py-3">
          <p class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">{{ t('taskPage.fields.ref') }}</p>
          <p class="mt-2 break-all text-sm">{{ task.result?.ref || t('common.notAvailable') }}</p>
        </div>
        <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/40 px-4 py-3">
          <p class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">
            {{ t('taskPage.fields.hash') }}
          </p>
          <p class="mt-2 break-all text-sm">{{ task.result?.hash || t('common.notAvailable') }}</p>
        </div>
      </div>

      <div
        v-if="task.status === 'succeeded'"
        class="mt-5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-4 flex items-center gap-3 text-emerald-200"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <h3 class="font-semibold text-base">{{ t('taskPage.successTitle') }}</h3>
          <p class="text-sm mt-0.5 opacity-90">{{ t('taskPage.successDescription') }}</p>
        </div>
      </div>

      <div
        v-else-if="task.status === 'failed'"
        class="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4 flex items-start gap-3 text-red-200"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6 shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <h3 class="font-semibold text-base">{{ t('taskPage.failureTitle') }}</h3>
          <p class="text-sm mt-0.5 opacity-90 whitespace-pre-wrap">
            {{ task.error || t('taskPage.unknownError') }}
          </p>
        </div>
      </div>
    </div>

    <TaskLogPanel :task="task" />

    <div class="flex flex-wrap gap-3">
      <BaseButton variant="secondary" @click="router.push('/')">{{ t('taskPage.actions.backToOverview') }}</BaseButton>
      <BaseButton v-if="task.result?.sdkId" variant="primary" @click="router.push(`/sdk/${task.result.sdkId}`)">{{
        t('taskPage.actions.openSdk')
      }}</BaseButton>
    </div>
  </section>

  <section
    v-else
    class="rounded-3xl border border-dashed border-vscode-panel-border px-6 py-12 text-center text-vscode-input-placeholder"
  >
    {{ t('taskPage.loading') }}
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import BaseButton from '@/components/common/BaseButton.vue';
import TaskLogPanel from '@/components/task/TaskLogPanel.vue';
import { useTaskCenterStore } from '@/stores/taskCenter';
import type { SdkTaskRecord } from '@/types';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const taskCenterStore = useTaskCenterStore();

const taskId = computed(() => route.params.taskId as string);
const task = computed(() => taskCenterStore.getTask(taskId.value));

const statusClass = computed(() => {
  switch (task.value?.status) {
    case 'failed':
      return 'border-red-500/40 bg-red-500/10 text-red-200';
    case 'succeeded':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
    default:
      return 'border-vscode-panel-border bg-vscode-input-background text-vscode-foreground';
  }
});

function loadTask() {
  taskCenterStore.fetchTask(taskId.value);
}

onMounted(loadTask);
watch(taskId, loadTask);

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

function taskStatusLabel(status: SdkTaskRecord['status']) {
  return t(`taskPage.status.${status}`);
}
</script>
