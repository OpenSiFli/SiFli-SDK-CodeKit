<template>
  <div class="form-control w-full">
    <label class="label">
      <span class="label-text text-vscode-foreground">SDK 来源</span>
    </label>
    <BaseSelect
      v-model="selectedSource"
      :options="sourceOptions"
      @update:modelValue="$emit('update:modelValue', $event)"
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
</script>
