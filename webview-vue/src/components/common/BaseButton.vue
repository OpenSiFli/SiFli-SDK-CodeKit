<template>
  <button :class="buttonClasses" :disabled="disabled || loading" @click="$emit('click', $event)">
    <span v-if="loading" class="button-spinner" aria-hidden="true"></span>
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
  block: false,
});

defineEmits<{
  click: [event: MouseEvent];
}>();

const buttonClasses = computed(() =>
  ['button-base', `button-${props.variant}`, `button-${props.size}`, props.block ? 'button-block' : '']
    .filter(Boolean)
    .join(' ')
);
</script>
