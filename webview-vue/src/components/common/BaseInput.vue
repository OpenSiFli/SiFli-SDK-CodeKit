<template>
  <input
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :type="type"
    :class="inputClasses"
    @input="handleInput"
    @focus="handleFocus"
    @blur="handleBlur"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BaseInputProps } from '@/types';

interface Props extends BaseInputProps {
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  type?: 'text' | 'password' | 'email' | 'number';
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  disabled: false,
  readonly: false,
  type: 'text'
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const isFocused = ref(false);

const inputClasses = computed(() => {
  return [
    'w-full px-3 py-2 rounded-md border transition-all duration-300',
    'bg-vscode-input-background text-vscode-input-foreground border-vscode-input-border',
    'placeholder:text-vscode-input-placeholder',
    'focus:border-vscode-focus-border focus:outline-none focus:ring-2 focus:ring-vscode-focus-border focus:ring-opacity-20',
    'hover:border-opacity-70',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'readonly:bg-opacity-50 readonly:cursor-default',
    isFocused.value ? 'border-vscode-focus-border shadow-lg' : ''
  ].filter(Boolean).join(' ');
});

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
};

const handleFocus = (event: FocusEvent) => {
  isFocused.value = true;
  emit('focus', event);
};

const handleBlur = (event: FocusEvent) => {
  isFocused.value = false;
  emit('blur', event);
};
</script>
