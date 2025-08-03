<template>
  <button
    :class="buttonClasses"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="loading loading-spinner loading-sm mr-2"></span>
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BaseButtonProps } from '@/types';

interface Props extends BaseButtonProps {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  block: false
});

defineEmits<{
  click: [event: MouseEvent];
}>();

const buttonClasses = computed(() => {
  const baseClasses = 'btn vscode-button btn-ripple transition-all duration-200 transform hover:scale-105 active:scale-95 focus:ring-2 focus:ring-opacity-50 rounded-md px-4 py-2 font-medium border-none focus:border-none';
  
  const variantClasses = {
    primary: 'btn-primary vscode-button-primary',
    secondary: 'btn-secondary vscode-button-secondary',
    success: 'btn-success vscode-button-success',
    warning: 'btn-warning vscode-button-warning',
    error: 'btn-error vscode-button-error',
    info: 'btn-info vscode-button-info'
  };

  const sizeClasses = {
    sm: 'btn-sm text-sm px-3 py-1',
    md: 'px-4 py-2',
    lg: 'btn-lg text-lg px-6 py-3'
  };

  const blockClass = props.block ? 'btn-block w-full' : '';

  return [
    baseClasses,
    variantClasses[props.variant],
    sizeClasses[props.size],
    blockClass
  ].filter(Boolean).join(' ');
});
</script>

<style scoped>
.btn-ripple {
  position: relative;
  overflow: hidden;
  border: none !important;
  outline: none !important;
}

.btn-ripple:focus {
  border: none !important;
  outline: none !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5) !important;
}

.btn-ripple:hover {
  border: none !important;
}

.btn-ripple:active {
  border: none !important;
}

.btn-ripple::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  transition: width 0.6s, height 0.6s, top 0.6s, left 0.6s;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.btn-ripple:active::before {
  width: 300px;
  height: 300px;
}
</style>
