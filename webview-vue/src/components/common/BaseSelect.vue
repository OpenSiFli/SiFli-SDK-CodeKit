<template>
  <div class="select-wrap">
    <select
      :value="modelValue"
      :disabled="disabled"
      class="select-base"
      @change="handleChange"
      @focus="$emit('focus', $event)"
      @blur="$emit('blur', $event)"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option v-for="option in options" :key="option.value" :value="option.value" :disabled="option.disabled">
        {{ option.label }}
      </option>
    </select>
    <span class="select-arrow">⌄</span>
  </div>
</template>

<script setup lang="ts">
import type { BaseSelectProps } from '@/types';

interface Props extends BaseSelectProps {
  modelValue?: string;
  disabled?: boolean;
  placeholder?: string;
}

withDefaults(defineProps<Props>(), {
  modelValue: '',
  disabled: false,
  placeholder: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const handleChange = (event: Event) => {
  emit('update:modelValue', (event.target as HTMLSelectElement).value);
};
</script>
