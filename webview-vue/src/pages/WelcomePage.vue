<template>
  <div class="min-h-screen bg-vscode-background text-vscode-foreground font-vscode">
    <!-- Language Selector -->
    <div class="absolute top-4 right-4 z-10">
      <LanguageSelector />
    </div>

    <!-- Header -->
    <header class="text-center py-4 border-b border-vscode-panel-border">
      <div class="flex flex-col items-center justify-center mb-2">
        <img 
          :src="logoSrc" 
          alt="SiFli Logo" 
          class="w-16 h-16 object-contain mb-2"
        />
        <div>
          <h1 class="text-2xl font-bold text-vscode-foreground">{{ $t('welcome.title') }}</h1>
          <p class="text-sm text-vscode-input-placeholder">{{ $t('welcome.subtitle') }}</p>
        </div>
      </div>
    </header>

    <!-- Content -->
    <div class="max-w-4xl mx-auto px-8 py-4 w-full">
      <!-- Welcome Message -->
      <div class="text-center mb-6">
        <h2 class="text-3xl font-bold mb-2">{{ $t('welcome.greeting') }}</h2>
        <p class="text-sm text-vscode-input-placeholder mb-1">
          {{ $t('welcome.prerequisites.intro') }}
        </p>
        <a 
          href="https://github.com/OpenSiFli/SiFli-SDK" 
          class="text-vscode-button-background hover:text-vscode-button-hover underline transition-colors duration-200"
          target="_blank"
        >
          {{ $t('welcome.prerequisites.link') }}
        </a>
        <p class="text-sm text-vscode-input-placeholder mt-1">
          {{ $t('welcome.prerequisites.outro') }}
        </p>
      </div>

      <!-- Setup Mode Selection -->
      <div class="mb-4">
        <h3 class="text-lg font-semibold text-center mb-3">{{ $t('welcome.setupMode.title') }}</h3>
        <p class="text-center text-vscode-input-placeholder mb-4 text-sm">
          {{ $t('welcome.setupMode.subtitle') }}
        </p>

        <!-- Options Grid -->
        <div class="grid gap-4 max-w-3xl mx-auto">
          <!-- Express Mode -->
          <div 
            @click="selectMode('express')"
            :class="[
              'setup-card',
              selectedMode === 'express' ? 'selected' : ''
            ]"
          >
            <div class="flex items-start">
              <div class="flex-shrink-0 mr-4">
                <div class="w-3 h-3 rounded-full border-2 border-vscode-button-background mt-1 transition-all duration-200"
                     :class="selectedMode === 'express' ? 'bg-vscode-button-background' : ''">
                </div>
              </div>
              <div class="flex-1">
                <h4 class="text-lg font-semibold mb-3">{{ $t('welcome.modes.express.title') }}</h4>
                <p class="text-sm text-vscode-input-placeholder">
                  {{ $t('welcome.modes.express.description') }}
                </p>
              </div>
            </div>
          </div>

          <!-- Advanced Mode -->
          <div 
            @click="selectMode('advanced')"
            :class="[
              'setup-card',
              selectedMode === 'advanced' ? 'selected' : ''
            ]"
          >
            <div class="flex items-start">
              <div class="flex-shrink-0 mr-4">
                <div class="w-3 h-3 rounded-full border-2 border-vscode-button-background mt-1 transition-all duration-200"
                     :class="selectedMode === 'advanced' ? 'bg-vscode-button-background' : ''">
                </div>
              </div>
              <div class="flex-1">
                <h4 class="text-lg font-semibold mb-3">{{ $t('welcome.modes.advanced.title') }}</h4>
                <p class="text-sm text-vscode-input-placeholder">
                  {{ $t('welcome.modes.advanced.description') }}
                </p>
              </div>
            </div>
          </div>

          <!-- Use Existing Setup -->
          <div 
            @click="selectMode('existing')"
            :class="[
              'setup-card',
              selectedMode === 'existing' ? 'selected' : ''
            ]"
          >
            <div class="flex items-start">
              <div class="flex-shrink-0 mr-4">
                <div class="w-3 h-3 rounded-full border-2 border-vscode-button-background mt-1 transition-all duration-200"
                     :class="selectedMode === 'existing' ? 'bg-vscode-button-background' : ''">
                </div>
              </div>
              <div class="flex-1">
                <h4 class="text-lg font-semibold mb-3">{{ $t('welcome.modes.existing.title') }}</h4>
                <p class="text-sm text-vscode-input-placeholder">
                  {{ $t('welcome.modes.existing.description') }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-center mt-6">
        <BaseButton
          variant="primary"
          :disabled="!selectedMode"
          @click="proceedWithMode"
          class="px-8 py-3"
        >
          {{ $t('common.continue') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import BaseButton from '@/components/common/BaseButton.vue';
import LanguageSelector from '@/components/common/LanguageSelector.vue';

// 直接引入 Logo 图片
import logoSrc from '@/assets/images/SiFli.png';

type SetupMode = 'express' | 'advanced' | 'existing';

const selectedMode = ref<SetupMode | null>(null);

const emit = defineEmits<{
  'mode-selected': [mode: SetupMode];
  'go-back': [];
}>();

const selectMode = (mode: SetupMode) => {
  selectedMode.value = mode;
};

const proceedWithMode = () => {
  if (selectedMode.value) {
    emit('mode-selected', selectedMode.value);
  }
};
</script>

<style scoped>
.setup-card {
  padding: 1.5rem;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
  animation: fadeInUp 0.6s ease-out;
}

.setup-card:hover {
  border-color: var(--vscode-button-background);
  background-color: var(--vscode-input-background);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.setup-card.selected {
  border-color: var(--vscode-button-background);
  background-color: var(--vscode-input-background);
  box-shadow: 0 0 0 1px var(--vscode-focusBorder);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.setup-card:nth-child(1) { animation-delay: 0.1s; }
.setup-card:nth-child(2) { animation-delay: 0.2s; }
.setup-card:nth-child(3) { animation-delay: 0.3s; }
</style>
