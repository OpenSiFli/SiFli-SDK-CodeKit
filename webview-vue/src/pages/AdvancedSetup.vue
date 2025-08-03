<template>
  <div class="min-h-screen bg-vscode-background text-vscode-foreground font-vscode p-8">
    <div class="max-w-2xl mx-auto">
      <!-- Back Button -->
      <div class="mb-6">
        <BaseButton
          variant="secondary"
          @click="$emit('go-back')"
          class="flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
          {{ $t('common.back') }}
        </BaseButton>
      </div>

      <!-- Header -->
      <header class="text-center mb-6 pb-4 border-b border-vscode-panel-border">
        <h1 class="text-3xl font-bold mb-2">{{ $t('advanced.title') }}</h1>
        <p class="text-vscode-input-placeholder text-sm">{{ $t('advanced.subtitle') }}</p>
      </header>

      <!-- Under Development Notice -->
      <div class="text-center py-20">
        <div class="w-24 h-24 mx-auto mb-6 bg-vscode-button-background bg-opacity-10 rounded-full flex items-center justify-center">
          <svg class="w-12 h-12 text-vscode-button-background" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a1 1 0 01-1-1V9a1 1 0 011-1h1a2 2 0 100-4H4a1 1 0 01-1-1V4a1 1 0 011-1h3a1 1 0 001-1z"></path>
          </svg>
        </div>
        
        <h2 class="text-2xl font-bold mb-4">{{ $t('advanced.underDevelopment.title') }}</h2>
        <p class="text-vscode-input-placeholder text-lg mb-8 max-w-md mx-auto">
          {{ $t('advanced.underDevelopment.description') }}
        </p>

        <!-- Features Coming Soon -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-lg mx-auto">
          <div class="text-center p-4 bg-vscode-input-background border border-vscode-panel-border rounded-lg">
            <div class="w-8 h-8 mx-auto mb-2 text-vscode-button-background">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
            </div>
            <h4 class="font-medium mb-1">{{ $t('advanced.features.customConfiguration') }}</h4>
            <p class="text-sm text-vscode-input-placeholder">{{ $t('advanced.features.customConfigurationDesc') }}</p>
          </div>
          
          <div class="text-center p-4 bg-vscode-input-background border border-vscode-panel-border rounded-lg">
            <div class="w-8 h-8 mx-auto mb-2 text-vscode-button-background">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
              </svg>
            </div>
            <h4 class="font-medium mb-1">{{ $t('advanced.features.multipleVersions') }}</h4>
            <p class="text-sm text-vscode-input-placeholder">{{ $t('advanced.features.multipleVersionsDesc') }}</p>
          </div>
        </div>

        <div class="mt-8">
          <p class="text-sm text-vscode-input-placeholder mb-4">
            {{ $t('advanced.underDevelopment.suggestion') }}
          </p>
          <BaseButton
            variant="primary"
            @click="$emit('go-back')"
            class="px-6 py-2"
          >
            {{ $t('advanced.underDevelopment.goToExpress') }}
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseButton from '@/components/common/BaseButton.vue';

// 定义 emits
defineEmits<{
  'go-back': []
}>();
</script>

<style scoped>
/* 开发中页面的动画效果 */
.fade-in {
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
