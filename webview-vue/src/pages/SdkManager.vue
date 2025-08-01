<template>
  <div>
    <!-- Welcome Page -->
    <WelcomePage
      v-if="currentPage === 'welcome'"
      @mode-selected="handleModeSelected"
      @go-back="currentPage = 'welcome'"
    />

    <!-- Express Setup -->
    <ExpressSetup
      v-else-if="currentPage === 'express'"
      @go-back="currentPage = 'welcome'"
      @installation-complete="handleInstallationComplete"
    />

        <!-- Advanced Setup (Original SDK Manager) -->
    <AdvancedSetup
      v-else-if="currentPage === 'advanced'"
      @go-back="currentPage = 'welcome'"
      @installation-complete="handleInstallationComplete"
    />

    <!-- Existing Setup -->
    <div v-else-if="currentPage === 'existing'" class="min-h-screen bg-vscode-background text-vscode-foreground font-vscode p-8">
      <div class="max-w-2xl mx-auto">
        <!-- Back Button -->
        <div class="mb-6">
          <BaseButton
            variant="secondary"
            @click="currentPage = 'welcome'"
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
          <div class="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <img 
              :src="logoSrc" 
              alt="SiFli Logo" 
              class="w-14 h-14 object-contain"
            />
          </div>
          <h1 class="text-2xl font-bold mb-2">{{ $t('existing.title') }}</h1>
          <p class="text-vscode-input-placeholder text-sm">{{ $t('existing.subtitle') }}</p>
        </header>

        <!-- Coming Soon -->
        <div class="text-center p-12 bg-vscode-input-background border border-vscode-panel-border rounded-lg">
          <div class="w-16 h-16 mx-auto mb-4 bg-vscode-button-background bg-opacity-10 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-vscode-button-background" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
          </div>
          <h3 class="text-xl font-semibold mb-2">{{ $t('existing.comingSoon.title') }}</h3>
          <p class="text-vscode-input-placeholder">{{ $t('existing.comingSoon.description') }}</p>
        </div>
      </div>
    </div>

    <!-- Success Page -->
    <div v-else-if="currentPage === 'success'" class="min-h-screen bg-vscode-background text-vscode-foreground font-vscode p-8">
      <div class="max-w-2xl mx-auto text-center">
        <div class="py-8">
          <div class="w-16 h-16 mx-auto mb-4 bg-green-500 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h1 class="text-2xl font-bold mb-3">{{ $t('success.title') }}</h1>
          <p class="text-sm text-vscode-input-placeholder mb-6">
            {{ $t('success.message') }}
          </p>
          <BaseButton
            variant="primary"
            @click="currentPage = 'welcome'"
            class="px-8 py-3"
          >
            {{ $t('success.returnHome') }}
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useVsCodeApi } from '@/composables/useVsCodeApi';
import BaseButton from '@/components/common/BaseButton.vue';
import WelcomePage from './WelcomePage.vue';
import ExpressSetup from './ExpressSetup.vue';
import AdvancedSetup from './AdvancedSetup.vue';

// 直接引入 Logo 图片
import logoSrc from '@/assets/images/SiFli.png';

type PageType = 'welcome' | 'express' | 'advanced' | 'existing' | 'success';

const currentPage = ref<PageType>('welcome');
const { isReady } = useVsCodeApi();

const handleModeSelected = (mode: string) => {
  if (mode === 'express') {
    currentPage.value = 'express';
  } else if (mode === 'advanced') {
    currentPage.value = 'advanced';
  } else if (mode === 'existing') {
    currentPage.value = 'existing';
  }
};

const handleInstallationComplete = () => {
  currentPage.value = 'success';
};

onMounted(() => {
  // 等待 VS Code API 准备好后再显示界面
  console.log('[SdkManager] Component mounted, VS Code ready:', isReady.value);
});
</script>

<style scoped>
@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInScale {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-slide-in-up {
  animation: slideInUp 0.5s ease-out;
}

.animate-fade-in-scale {
  animation: fadeInScale 0.3s ease-out;
}

.vscode-card {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
}

.vscode-card:hover {
  border-color: var(--vscode-focus-border);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}
</style>
