<template>
  <div class="form-item animate-slide-in-up">
    <label class="block text-sm font-medium text-vscode-foreground mb-2 transition-colors duration-200">
      SDK 来源
    </label>
    <BaseSelect
      v-model="selectedSource"
      :options="sourceOptions"
      placeholder="请选择 SDK 来源"
      @update:modelValue="handleSourceUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import BaseSelect from '@/components/common/BaseSelect.vue';
import type { SdkSource } from '@/types';

interface Props {
  modelValue: SdkSource;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: SdkSource];
}>();

const selectedSource = computed({
  get: () => props.modelValue,
  set: (value: SdkSource) => emit('update:modelValue', value)
});

const sourceOptions = computed(() => [
  { value: 'github', label: 'GitHub' },
  { value: 'gitee', label: 'Gitee' }
]);

const handleSourceUpdate = (value: string) => {
  emit('update:modelValue', value as SdkSource);
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
  animation: slideInUp 0.5s ease-out;
}
</style>
