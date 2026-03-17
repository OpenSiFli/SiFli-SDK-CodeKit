<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
    <div class="w-full max-w-xl rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-xl font-semibold">切换版本</h3>
          <p class="mt-1 text-sm text-vscode-input-placeholder">选择目标 Ref，并可同时指定新的目录名称。</p>
        </div>
        <button class="text-sm text-vscode-input-placeholder hover:text-vscode-foreground" @click="$emit('close')">
          关闭
        </button>
      </div>

      <div class="mt-6 space-y-4">
        <div>
          <label class="mb-2 block text-sm font-medium">目标版本</label>
          <BaseSelect v-model="selectedTargetRef" :options="targetOptions" placeholder="请选择目标版本" />
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium">目录名称</label>
          <BaseInput v-model="directoryName" placeholder="请输入新的目录名称" />
        </div>
      </div>

      <div class="mt-6 flex flex-wrap justify-end gap-3">
        <BaseButton variant="secondary" @click="$emit('close')">取消</BaseButton>
        <BaseButton
          variant="primary"
          :disabled="!selectedTarget || !directoryName.trim() || busy"
          :loading="busy"
          @click="handleConfirm"
        >
          执行切换
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
import type { SdkTarget } from '@/types';

const props = defineProps<{
  open: boolean;
  targets: SdkTarget[];
  initialDirectoryName: string;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [payload: { targetRef: string; targetKind: 'branch' | 'tag'; directoryName: string }];
}>();

const selectedTargetRef = ref('');
const directoryName = ref('');

const targetOptions = computed(() =>
  props.targets.map(item => ({
    value: item.ref,
    label: `${item.kind === 'branch' ? 'Branch' : 'Tag'} · ${item.label}`,
  }))
);

const selectedTarget = computed(() => props.targets.find(item => item.ref === selectedTargetRef.value) ?? null);

watch(
  () => props.open,
  isOpen => {
    if (!isOpen) {
      return;
    }

    selectedTargetRef.value = props.targets[0]?.ref ?? '';
    directoryName.value = props.initialDirectoryName;
  },
  { immediate: true }
);

watch(selectedTarget, target => {
  if (target) {
    directoryName.value = target.defaultDirectoryName;
  }
});

function handleConfirm() {
  if (!selectedTarget.value) {
    return;
  }

  emit('confirm', {
    targetRef: selectedTarget.value.ref,
    targetKind: selectedTarget.value.kind,
    directoryName: directoryName.value.trim(),
  });
}
</script>
