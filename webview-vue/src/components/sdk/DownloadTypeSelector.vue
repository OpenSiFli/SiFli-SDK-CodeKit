<template>
  <div class="form-item animate-slide-in-up">
    <label class="block text-sm font-medium text-vscode-foreground mb-2 transition-colors duration-200">
      下载类型
    </label>
    <BaseSelect
      v-model="selectedType"
      :options="downloadTypeOptions"
      placeholder="请选择下载类型"
      @update:modelValue="handleTypeUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import BaseSelect from '@/components/common/BaseSelect.vue';
import type { DownloadType } from '@/types';

interface Props {
  modelValue: DownloadType;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: DownloadType];
}>();

const selectedType = computed({
  get: () => props.modelValue,
  set: (value: DownloadType) => emit('update:modelValue', value)
});

const downloadTypeOptions = computed(() => [
  { value: 'release', label: '发布版本 (Release)' },
  { value: 'branch', label: '开发分支 (Branch)' }
]);

const handleTypeUpdate = (value: string) => {
  emit('update:modelValue', value as DownloadType);
};
</script>

<style scoped>
.form-item {
  transition: all 0.3s ease;
}

.form-item:hover {
  transform: translateX(2px);
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slide-in-up {
  animation: slideInUp 0.5s ease-out forwards;
  opacity: 0;
}
</style>
