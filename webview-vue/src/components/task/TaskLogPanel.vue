<template>
  <div class="rounded-3xl border border-vscode-panel-border bg-[#101215] p-4 text-sm text-slate-100 shadow-sm">
    <div class="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
      <div>
        <h3 class="font-semibold text-white">任务日志</h3>
        <p class="mt-1 text-xs text-slate-400">保留完整输出，便于定位 Git 和脚本失败原因。</p>
      </div>
      <button
        class="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
        title="复制完整日志"
        @click="copyAll"
      >
        <svg
          v-if="copied"
          xmlns="http://www.w3.org/2000/svg"
          class="h-3.5 w-3.5 text-emerald-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clip-rule="evenodd"
          />
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          class="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        {{ copied ? '已复制' : '复制全部' }}
      </button>
    </div>

    <div ref="logContainer" class="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-2 font-mono text-xs">
      <div
        v-for="entry in task.logs"
        :key="`${entry.ts}-${entry.message}`"
        class="flex gap-3 py-0.5"
        :class="entry.level === 'error' ? 'text-red-400' : entry.level === 'warn' ? 'text-amber-400' : 'text-slate-300'"
      >
        <span class="shrink-0 text-slate-500">[{{ formatTimestamp(entry.ts) }}]</span>
        <span class="whitespace-pre-wrap break-words">{{ entry.message }}</span>
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
import { ref, watch, nextTick } from 'vue';
import type { SdkTaskRecord } from '@/types';

const props = defineProps<{
  task: SdkTaskRecord;
}>();

const copied = ref(false);
const logContainer = ref<HTMLElement | null>(null);

watch(
  () => props.task.logs.length,
  () => {
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight;
      }
    });
  }
);

async function copyAll() {
  const text = props.task.logs.map(l => `[${formatTimestamp(l.ts)}] ${l.message}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy', err);
  }
}

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString();
}
</script>
