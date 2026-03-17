<template>
  <section v-if="task" class="space-y-6">
    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">Task</p>
          <h2 class="mt-3 text-3xl font-semibold tracking-tight">{{ task.title }}</h2>
          <p class="mt-2 text-sm text-vscode-input-placeholder">
            任务状态会持续更新，失败时直接展示底层输出，不做自动处理。
          </p>
        </div>
        <span class="rounded-full border px-4 py-2 text-xs uppercase tracking-[0.24em]" :class="statusClass">
          {{ task.status }}
        </span>
      </div>

      <div class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/40 px-4 py-3">
          <p class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">Started</p>
          <p class="mt-2 text-sm">{{ formatTimestamp(task.startedAt) }}</p>
        </div>
        <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/40 px-4 py-3">
          <p class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">Finished</p>
          <p class="mt-2 text-sm">{{ task.finishedAt ? formatTimestamp(task.finishedAt) : '运行中' }}</p>
        </div>
        <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/40 px-4 py-3">
          <p class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">Ref</p>
          <p class="mt-2 break-all text-sm">{{ task.result?.ref || 'N/A' }}</p>
        </div>
        <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/40 px-4 py-3">
          <p class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">Hash</p>
          <p class="mt-2 break-all text-sm">{{ task.result?.hash || 'N/A' }}</p>
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
          <h3 class="font-semibold text-base">操作已成功完成</h3>
          <p class="text-sm mt-0.5 opacity-90">SDK 现在可以正常使用或在其详情页中进行管理。</p>
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
          <h3 class="font-semibold text-base">操作失败</h3>
          <p class="text-sm mt-0.5 opacity-90 whitespace-pre-wrap">
            {{ task.error || '遇到未知错误，请查看下方日志排查问题。' }}
          </p>
        </div>
      </div>
    </div>

    <TaskLogPanel :task="task" />

    <div class="flex flex-wrap gap-3">
      <BaseButton variant="secondary" @click="router.push('/')">返回总览</BaseButton>
      <BaseButton v-if="task.result?.sdkId" variant="primary" @click="router.push(`/sdk/${task.result.sdkId}`)"
        >查看对应 SDK</BaseButton
      >
    </div>
  </section>

  <section
    v-else
    class="rounded-3xl border border-dashed border-vscode-panel-border px-6 py-12 text-center text-vscode-input-placeholder"
  >
    正在加载任务信息...
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BaseButton from '@/components/common/BaseButton.vue';
import TaskLogPanel from '@/components/task/TaskLogPanel.vue';
import { useTaskCenterStore } from '@/stores/taskCenter';

const route = useRoute();
const router = useRouter();
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
</script>
