<template>
  <div class="min-h-screen bg-vscode-background text-vscode-foreground font-vscode relative overflow-hidden">
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-red-500/10 to-orange-500/10 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2"></div>
      <div class="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-tl from-gray-500/10 to-purple-500/10 rounded-full blur-3xl transform translate-x-1/2 translate-y-1/2"></div>
    </div>

    <div class="relative z-10 p-8">
      <div class="max-w-4xl mx-auto">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-24 h-24 mb-6 bg-red-500/20 rounded-full animate-pulse">
            <svg class="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
          </div>
          <h1 class="text-3xl font-bold mb-3 text-red-400">安装失败</h1>
          <p class="text-sm text-vscode-input-placeholder">{{ message }}</p>
        </div>

        <div class="vscode-card rounded-lg p-6 border border-red-500/30 bg-vscode-editor-background/60">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold flex items-center gap-2">
              <span class="w-2 h-2 bg-red-400 rounded-full"></span>
              安装日志
            </h2>
            <div class="flex gap-2">
              <button
                @click="copyLogs"
                class="px-3 py-1 text-sm bg-vscode-button-background text-vscode-button-foreground rounded hover:bg-vscode-button-hoverBackground"
              >
                复制日志
              </button>
              <button
                @click="$emit('go-back')"
                class="px-3 py-1 text-sm bg-vscode-button-secondaryBackground text-vscode-button-foreground rounded hover:bg-vscode-button-hoverBackground"
              >
                返回首页
              </button>
            </div>
          </div>

          <div
            ref="logContainer"
            class="bg-black/60 text-red-200 text-xs font-mono p-4 rounded border border-red-500/30 max-h-96 overflow-y-auto"
            style="scrollbar-width: thin; scrollbar-color: #ef4444 #1f2937;"
          >
            <div v-if="logs.length === 0" class="text-gray-400 italic">
              暂无日志输出
            </div>
            <div v-else class="space-y-1">
              <div
                v-for="(log, index) in logs"
                :key="index"
                class="leading-tight"
              >
                <span class="text-gray-500 mr-2">[{{ index + 1 }}]</span>{{ log }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useVsCodeApi } from '@/composables/useVsCodeApi';

const props = defineProps<{
  message: string;
  logs: string[];
}>();

defineEmits<{
  (e: 'go-back'): void;
}>();

const logContainer = ref<HTMLElement | null>(null);
const { postMessage } = useVsCodeApi();

const copyLogs = async () => {
  const text = props.logs.join('\n');
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fallback to vscode message
    }
  }
  postMessage({ command: 'copyText', text });
};

watch(
  () => props.logs,
  () => {
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight;
      }
    });
  },
  { deep: true }
);
</script>

<style scoped>
.vscode-card {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}
</style>
