<template>
  <div class="form-control w-full">
    <label class="label">
      <span class="label-text text-vscode-foreground">下载类型</span>
    </label>
    <BaseSelect
      v-model="selectedType"
      :options="downloadTypeOptions"
      @update:modelValue="$emit('update:modelValue', $event)"
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
</script>
