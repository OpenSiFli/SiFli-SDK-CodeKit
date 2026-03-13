<template>
  <div class="rounded-3xl border border-vscode-panel-border bg-[#101215] p-4 text-sm text-slate-100 shadow-sm">
    <div class="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
      <div>
        <h3 class="font-semibold text-white">任务日志</h3>
        <p class="mt-1 text-xs text-slate-400">保留完整输出，便于定位 Git 和脚本失败原因。</p>
      </div>
      <span
        class="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-300"
      >
        {{ task.logs.length }} entries
      </span>
    </div>

    <div class="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-2 font-mono text-xs">
      <div
        v-for="entry in task.logs"
        :key="`${entry.ts}-${entry.message}`"
        class="rounded-2xl border border-white/5 px-3 py-2"
        :class="
          entry.level === 'error'
            ? 'bg-red-500/10 text-red-100'
            : entry.level === 'warn'
              ? 'bg-amber-500/10 text-amber-100'
              : 'bg-white/5 text-slate-100'
        "
      >
        <div class="mb-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">{{ formatTimestamp(entry.ts) }}</div>
        <div class="whitespace-pre-wrap break-words">{{ entry.message }}</div>
      </div>

      <div
        v-if="task.logs.length === 0"
        class="rounded-2xl border border-dashed border-white/10 px-3 py-5 text-center text-slate-500"
      >
        暂无日志输出。
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SdkTaskRecord } from '@/types';

defineProps<{
  task: SdkTaskRecord;
}>();

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}
</script>
