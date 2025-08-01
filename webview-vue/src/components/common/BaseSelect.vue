<template>
  <div class="select-container relative">
    <select
      :value="modelValue"
      :disabled="disabled"
      :class="selectClasses"
      @change="handleChange"
      @focus="handleFocus"
      @blur="handleBlur"
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
    <div class="select-arrow">
      <svg 
        :class="{ 'rotate-180': isFocused }"
        class="w-4 h-4 transition-transform duration-200" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
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

const isFocused = ref(false);

const selectClasses = computed(() => {
  return [
    'w-full px-3 py-2 pr-10 rounded-md border transition-all duration-300',
    'bg-vscode-input-background text-vscode-input-foreground border-vscode-input-border',
    'focus:border-vscode-focus-border focus:outline-none focus:ring-2 focus:ring-vscode-focus-border focus:ring-opacity-20',
    'hover:border-opacity-70 cursor-pointer appearance-none',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    isFocused.value ? 'border-vscode-focus-border shadow-lg' : ''
  ].filter(Boolean).join(' ');
});

const handleChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
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

<style scoped>
.select-container {
  position: relative;
}

.select-arrow {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--vscode-input-foreground);
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.select-container:hover .select-arrow {
  opacity: 1;
}

select:focus + .select-arrow {
  color: var(--vscode-focus-border);
  opacity: 1;
}

/* 隐藏默认箭头 */
select {
  background-image: none;
}

select::-ms-expand {
  display: none;
}
</style>
