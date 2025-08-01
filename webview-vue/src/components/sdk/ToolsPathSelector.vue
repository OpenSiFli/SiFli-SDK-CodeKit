<template>
  <div class="form-item animate-slide-in-up" style="animation-delay: 0.35s;">
    <label class="block text-sm font-medium text-vscode-foreground mb-3 transition-colors duration-200">
      {{ $t('sdk.toolsPath.label') }}
    </label>
    
    <!-- 工具链路径输入区域 -->
    <div class="flex items-center gap-2">
      <!-- 路径输入框 -->
      <div class="flex-1">
        <input
          v-model="toolsPath"
          type="text"
          :placeholder="$t('sdk.toolsPath.placeholder')"
          class="w-full px-3 py-2 bg-vscode-input-background text-vscode-input-foreground placeholder-vscode-input-placeholder border border-vscode-input-border rounded focus:ring-2 focus:ring-vscode-focus-border focus:border-vscode-focus-border outline-none transition-all duration-200"
          @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        />
      </div>
      
      <!-- 浏览按钮 -->
      <BaseButton
        variant="secondary"
        @click="$emit('browse')"
        class="px-4"
      >
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"></path>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5a2 2 0 012-2h2a2 2 0 012 2v1H8V5z"></path>
        </svg>
        {{ $t('common.browse') }}
      </BaseButton>
    </div>
    
    <!-- 描述文本 -->
    <p class="text-xs text-vscode-input-placeholder mt-2">
      {{ $t('sdk.toolsPath.description') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import BaseButton from '@/components/common/BaseButton.vue';

interface Props {
  modelValue: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  browse: [];
}>();

const toolsPath = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
});
</script>

<style scoped>
/* 动画样式 */
@keyframes slide-in-up {
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
  animation: slide-in-up 0.5s ease-out forwards;
  opacity: 0;
}
</style>
