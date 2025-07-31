<template>
  <select
    :value="modelValue"
    :disabled="disabled"
    :class="selectClasses"
    @change="handleChange"
    @focus="$emit('focus', $event)"
    @blur="$emit('blur', $event)"
  >
    <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
    <option
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :disabled="option.disabled"
    >
      {{ option.label }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BaseSelectProps } from '@/types';

interface Props extends BaseSelectProps {
  modelValue?: string;
  options: Array<{
    value: string;
    label: string;
    disabled?: boolean;
  }>;
  disabled?: boolean;
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  disabled: false,
  placeholder: ''
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const selectClasses = computed(() => {
  return [
    'select select-bordered w-full vscode-input',
    'focus:border-vscode-focus-border focus:outline-none',
    'disabled:opacity-50 disabled:cursor-not-allowed'
  ].join(' ');
});

const handleChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  emit('update:modelValue', target.value);
};
</script>
