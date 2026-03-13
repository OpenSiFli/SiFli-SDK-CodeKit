<template>
  <div v-if="open" class="dialog-backdrop" @click="handleBackdropClick">
    <div class="dialog-panel" @click.stop>
      <div class="dialog-header">
        <div>
          <h3 class="text-xl font-semibold text-vscode-foreground">修改工具链配置</h3>
          <p class="mt-1 text-sm text-vscode-input-placeholder">正在更新 SDK 依赖的编译工具源与本地环境配置。</p>
        </div>
        <button class="icon-button" @click="onClose">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>

      <div class="grid gap-5">
        <div>
          <label class="mb-2 block text-sm font-medium">工具链源</label>
          <BaseSelect v-model="sourceValue" :options="sourceOptions" />
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium">工具链目录</label>
          <div class="flex gap-3">
            <BaseInput v-model="toolsPathValue" placeholder="可选，留空则使用默认环境" />
            <BaseButton variant="primary" class="shrink-0" @click="browseToolsPath">
              <span class="flex items-center gap-1.5 whitespace-nowrap">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                浏览
              </span>
            </BaseButton>
          </div>
        </div>
      </div>

      <div class="mt-4 flex justify-end gap-3 border-t border-vscode-panel-border pt-4">
        <BaseButton variant="secondary" :disabled="busy" @click="onClose">取消</BaseButton>
        <BaseButton variant="primary" :disabled="busy || !hasChanges" @click="onConfirm">
          <svg v-if="busy" class="button-spinner mr-2" viewBox="0 0 24 24"></svg>
          保存修改
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BaseButton from '@/components/common/BaseButton.vue';
import BaseInput from '@/components/common/BaseInput.vue';
import BaseSelect from '@/components/common/BaseSelect.vue';
import { onMessage, postMessage } from '@/services/vscodeBridge';

interface Props {
  open: boolean;
  initialSource?: string;
  initialToolsPath?: string;
  busy?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
  confirm: [payload: { source: string; toolsPath: string }];
}>();

const sourceOptions = [
  { value: 'github', label: 'GitHub' },
  { value: 'sifli', label: 'SiFli 镜像' },
];

const sourceValue = ref(props.initialSource || 'github');
const toolsPathValue = ref(props.initialToolsPath || '');
let browseDisposer: (() => void) | null = null;

watch(
  () => props.open,
  isOpen => {
    if (isOpen) {
      sourceValue.value = props.initialSource || 'github';
      toolsPathValue.value = props.initialToolsPath || '';

      if (!browseDisposer) {
        browseDisposer = onMessage<{ path: string }>('toolsPathSelected', payload => {
          toolsPathValue.value = payload.path;
        });
      }
    } else {
      if (browseDisposer) {
        browseDisposer();
        browseDisposer = null;
      }
    }
  }
);

const hasChanges = computed(() => {
  const isSourceChanged = sourceValue.value !== (props.initialSource || 'github');
  const isToolsPathChanged = toolsPathValue.value !== (props.initialToolsPath || '');
  return isSourceChanged || isToolsPathChanged;
});

const browseToolsPath = () => {
  postMessage({ command: 'browseToolsPath' });
};

const onClose = () => {
  if (!props.busy) {
    emit('close');
  }
};

const handleBackdropClick = () => {
  if (!props.busy) {
    emit('close');
  }
};

const onConfirm = () => {
  if (!props.busy && hasChanges.value) {
    emit('confirm', {
      source: sourceValue.value,
      toolsPath: toolsPathValue.value.trim(),
    });
  }
};
</script>
