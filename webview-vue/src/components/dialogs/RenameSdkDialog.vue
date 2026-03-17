<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
    <div class="w-full max-w-lg rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-xl font-semibold">重命名 SDK 目录</h3>
          <p class="mt-1 text-sm text-vscode-input-placeholder">仅修改当前 SDK 所在目录的 basename。</p>
        </div>
        <button class="text-sm text-vscode-input-placeholder hover:text-vscode-foreground" @click="$emit('close')">
          关闭
        </button>
      </div>

      <div class="mt-6">
        <label class="mb-2 block text-sm font-medium">新的目录名称</label>
        <BaseInput v-model="directoryName" placeholder="请输入目录名称" />
      </div>

      <div class="mt-6 flex flex-wrap justify-end gap-3">
        <BaseButton variant="secondary" @click="$emit('close')">取消</BaseButton>
        <BaseButton
          variant="primary"
          :disabled="!directoryName.trim() || busy"
          :loading="busy"
          @click="$emit('confirm', directoryName.trim())"
        >
          确认重命名
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import BaseButton from '@/components/common/BaseButton.vue';
import BaseInput from '@/components/common/BaseInput.vue';

const props = defineProps<{
  open: boolean;
  initialName: string;
  busy?: boolean;
}>();

const directoryName = ref('');

watch(
  () => props.open,
  isOpen => {
    if (isOpen) {
      directoryName.value = props.initialName;
    }
  },
  { immediate: true }
);

defineEmits<{
  close: [];
  confirm: [directoryName: string];
}>();
</script>
