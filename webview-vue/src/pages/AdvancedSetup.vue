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
          Back
        </BaseButton>
      </div>

      <!-- Header -->
      <header class="text-center mb-6 pb-4 border-b border-vscode-panel-border">
        <div class="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <img 
            :src="logoSrc" 
            alt="SiFli Logo" 
            class="w-14 h-14 object-contain transition-transform duration-300 hover:scale-110"
          />
        </div>
        <h1 class="text-2xl font-bold mb-2">{{ $t('advanced.title') }}</h1>
        <p class="text-vscode-input-placeholder text-sm">{{ $t('advanced.subtitle') }}</p>
      </header>

      <!-- Main Form -->
      <div class="vscode-card rounded-lg p-6 space-y-8 animate-fade-in-scale">
        <!-- SDK Source Selection -->
        <SdkSourceSelector
          v-model="sdkManager.state.value.sdkSource"
        />

        <!-- Download Type Selection -->
        <DownloadTypeSelector
          v-model="sdkManager.state.value.downloadType"
        />

        <!-- Version/Branch Selection -->
        <div class="animate-slide-in-up" style="animation-delay: 0.2s;">
          <SdkVersionSelector
            :download-type="sdkManager.state.value.downloadType"
            :releases="sdkManager.state.value.availableReleases"
            :branches="sdkManager.state.value.availableBranches"
            :selected-version="sdkManager.state.value.selectedVersion"
            :selected-branch="sdkManager.state.value.selectedBranch"
            :is-loading="sdkManager.state.value.isLoading"
            @update:version="sdkManager.state.value.selectedVersion = $event"
            @update:branch="sdkManager.state.value.selectedBranch = $event"
          />
        </div>

        <!-- Installation Path Selection -->
        <InstallPathSelector
          v-model="sdkManager.state.value.installPath"
          :final-path="sdkManager.finalInstallPath.value"
          :selected-version="sdkManager.state.value.selectedVersion"
          :selected-branch="sdkManager.state.value.selectedBranch"
          :download-type="sdkManager.state.value.downloadType"
          @browse="sdkManager.browsePath"
        />

        <!-- Advanced Options -->
        <div class="animate-slide-in-up" style="animation-delay: 0.3s;">
          <h3 class="text-lg font-semibold mb-4 text-vscode-editor-foreground">Advanced Options</h3>
          <div class="space-y-4">
            <!-- Skip verification -->
            <label class="flex items-center space-x-3 cursor-pointer group">
              <input 
                v-model="advancedOptions.skipVerification"
                type="checkbox" 
                class="w-4 h-4 rounded border-vscode-input-border bg-vscode-input-background text-vscode-button-background focus:ring-2 focus:ring-vscode-button-background"
              >
              <div>
                <span class="text-vscode-editor-foreground group-hover:text-vscode-button-background transition-colors">
                  Skip file verification
                </span>
                <p class="text-sm text-vscode-input-placeholder">
                  Faster installation but may miss corrupted files
                </p>
              </div>
            </label>

            <!-- Create desktop shortcut -->
            <label class="flex items-center space-x-3 cursor-pointer group">
              <input 
                v-model="advancedOptions.createShortcut"
                type="checkbox" 
                class="w-4 h-4 rounded border-vscode-input-border bg-vscode-input-background text-vscode-button-background focus:ring-2 focus:ring-vscode-button-background"
              >
              <div>
                <span class="text-vscode-editor-foreground group-hover:text-vscode-button-background transition-colors">
                  Create desktop shortcut
                </span>
                <p class="text-sm text-vscode-input-placeholder">
                  Add shortcut to desktop for quick access
                </p>
              </div>
            </label>

            <!-- Add to PATH -->
            <label class="flex items-center space-x-3 cursor-pointer group">
              <input 
                v-model="advancedOptions.addToPath"
                type="checkbox" 
                class="w-4 h-4 rounded border-vscode-input-border bg-vscode-input-background text-vscode-button-background focus:ring-2 focus:ring-vscode-button-background"
              >
              <div>
                <span class="text-vscode-editor-foreground group-hover:text-vscode-button-background transition-colors">
                  Add to system PATH
                </span>
                <p class="text-sm text-vscode-input-placeholder">
                  Enable global access to SDK tools
                </p>
              </div>
            </label>
          </div>
        </div>

        <!-- Installation Summary -->
        <div class="bg-vscode-input-background border border-vscode-panel-border rounded-lg p-4 animate-slide-in-up" style="animation-delay: 0.4s;">
          <h3 class="text-lg font-semibold mb-3 text-vscode-editor-foreground">Installation Summary</h3>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-vscode-input-placeholder">Source:</span>
              <span class="text-vscode-editor-foreground capitalize">{{ sdkManager.state.value.sdkSource }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-vscode-input-placeholder">Type:</span>
              <span class="text-vscode-editor-foreground capitalize">{{ sdkManager.state.value.downloadType }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-vscode-input-placeholder">Version:</span>
              <span class="text-vscode-editor-foreground">
                {{ sdkManager.state.value.downloadType === 'release' 
                    ? sdkManager.state.value.selectedVersion || 'Not selected' 
                    : sdkManager.state.value.selectedBranch || 'Not selected' }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-vscode-input-placeholder">Install to:</span>
              <span class="text-vscode-editor-foreground font-mono text-xs">
                {{ sdkManager.finalInstallPath.value || 'Not configured' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Installation Button -->
        <div class="pt-4 animate-slide-in-up" style="animation-delay: 0.5s;">
          <BaseButton
            variant="primary"
            size="lg"
            block
            :disabled="!sdkManager.isFormValid.value"
            :loading="sdkManager.state.value.isInstalling"
            @click="handleInstall"
          >
            <span v-if="sdkManager.state.value.isInstalling">Installing...</span>
            <span v-else>Install SiFli SDK</span>
          </BaseButton>
        </div>
      </div>

      <!-- Loading Status Indicator -->
      <Transition name="fade">
        <div v-if="sdkManager.state.value.isLoading" class="text-center mt-4">
          <div class="loading loading-spinner loading-md text-vscode-button-background"></div>
          <p class="text-sm text-vscode-input-placeholder mt-2">Loading options...</p>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSdkManager } from '@/composables/useSdkManager';
import BaseButton from '@/components/common/BaseButton.vue';
import SdkSourceSelector from '@/components/sdk/SdkSourceSelector.vue';
import DownloadTypeSelector from '@/components/sdk/DownloadTypeSelector.vue';
import SdkVersionSelector from '@/components/sdk/SdkVersionSelector.vue';
import InstallPathSelector from '@/components/sdk/InstallPathSelector.vue';

// 直接引入 Logo 图片
import logoSrc from '@/assets/images/SiFli.png';

// 定义 emits
const emit = defineEmits<{
  'go-back': []
  'installation-complete': []
}>();

// Advanced options
const advancedOptions = ref({
  skipVerification: false,
  createShortcut: true,
  addToPath: true
});

const sdkManager = useSdkManager();

const handleInstall = async () => {
  try {
    // 可以在这里处理高级选项，传递给后端
    console.log('Advanced options:', advancedOptions.value);
    await sdkManager.installSdk();
    emit('installation-complete');
  } catch (error) {
    console.error('Installation failed:', error);
  }
};

onMounted(() => {
  sdkManager.initialize();
});
</script>
