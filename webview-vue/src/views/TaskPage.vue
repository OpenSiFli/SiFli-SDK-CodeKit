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
        v-if="task.error"
        class="mt-5 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
      >
        {{ task.error }}
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
