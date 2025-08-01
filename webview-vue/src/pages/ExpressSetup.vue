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
              <!-- Header -->
        <header class="text-center mb-6 pb-4 border-b border-vscode-panel-border">
          <div class="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <img 
              :src="logoSrc" 
              alt="SiFli Logo" 
              class="w-14 h-14 object-contain"
            />
          </div>
          <h1 class="text-2xl font-bold mb-2">{{ $t('express.title') }}</h1>
          <p class="text-vscode-input-placeholder text-sm">{{ $t('express.subtitle') }}</p>
        </header>

      <!-- Installation Card -->
      <div class="bg-vscode-input-background border border-vscode-panel-border rounded-lg p-6 mb-6">
        <div class="text-center">
          <div class="w-16 h-16 mx-auto mb-4 bg-vscode-button-background rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
          </div>
          <h3 class="text-xl font-semibold mb-2">Latest SiFli SDK</h3>
          <p class="text-vscode-input-placeholder mb-4">
            Will automatically download and install the latest stable version from GitHub
          </p>
          
          <!-- Installation Path -->
          <div class="bg-vscode-background border border-vscode-input-border rounded p-3 mb-4">
            <div class="text-sm text-vscode-input-placeholder mb-1">Installation Path:</div>
            <div class="font-mono text-sm text-vscode-foreground">
              {{ installPath }}
            </div>
            <BaseButton
              variant="secondary"
              size="sm"
              @click="browsePath"
              class="mt-2"
            >
              Change Path
            </BaseButton>
          </div>
        </div>
      </div>

      <!-- Progress Section -->
      <div v-if="isInstalling" class="mb-6">
        <div class="bg-vscode-input-background border border-vscode-panel-border rounded-lg p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="loading-spinner w-5 h-5 border-2 border-vscode-button-background border-t-transparent rounded-full"></div>
            <span class="font-medium">Installing SiFli SDK...</span>
          </div>
          <div class="w-full bg-vscode-background rounded-full h-2">
            <div 
              class="bg-vscode-button-background h-2 rounded-full transition-all duration-300"
              :style="{ width: `${progress}%` }"
            ></div>
          </div>
          <div class="text-sm text-vscode-input-placeholder mt-2">{{ progressMessage }}</div>
        </div>
      </div>

      <!-- Action Button -->
      <div class="text-center">
        <BaseButton
          variant="primary"
          size="lg"
          :disabled="isInstalling"
          :loading="isInstalling"
          @click="startInstallation"
          class="px-12 py-4 text-lg"
        >
          <span v-if="isInstalling">Installing...</span>
          <span v-else>Install SiFli SDK</span>
        </BaseButton>
      </div>

      <!-- Features List -->
      <div class="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="text-center">
          <div class="w-12 h-12 mx-auto mb-3 bg-green-500 bg-opacity-10 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h4 class="font-medium mb-1">Latest Version</h4>
          <p class="text-sm text-vscode-input-placeholder">Always get the most recent stable release</p>
        </div>
        
        <div class="text-center">
          <div class="w-12 h-12 mx-auto mb-3 bg-blue-500 bg-opacity-10 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v18m9-9H3"></path>
            </svg>
          </div>
          <h4 class="font-medium mb-1">One-Click Setup</h4>
          <p class="text-sm text-vscode-input-placeholder">No configuration needed, works out of the box</p>
        </div>
        
        <div class="text-center">
          <div class="w-12 h-12 mx-auto mb-3 bg-purple-500 bg-opacity-10 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
          </div>
          <h4 class="font-medium mb-1">Fast Download</h4>
          <p class="text-sm text-vscode-input-placeholder">Optimized download from GitHub</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useVsCodeApi } from '@/composables/useVsCodeApi';
import BaseButton from '@/components/common/BaseButton.vue';

// 直接引入 Logo 图片
import logoSrc from '@/assets/images/SiFli.png';

const { postMessage, onMessage } = useVsCodeApi();

const isInstalling = ref(false);
const progress = ref(0);
const progressMessage = ref('');
const userSelectedPath = ref('');

const installPath = computed(() => {
  return userSelectedPath.value || `${getDefaultPath()}/SiFli-SDK/latest`;
});

const getDefaultPath = () => {
  // 在实际环境中，可以从 VS Code API 获取
  return '/Users/username/sifli-sdk';
};

const emit = defineEmits<{
  'go-back': [];
  'installation-complete': [];
}>();

const browsePath = () => {
  postMessage({
    command: 'browseInstallPath'
  });
};

const startInstallation = () => {
  isInstalling.value = true;
  progress.value = 0;
  progressMessage.value = 'Preparing installation...';
  
  postMessage({
    command: 'startSdkInstallation',
    source: 'github',
    type: 'tag',
    name: 'latest',
    installPath: installPath.value
  });
};

// 消息监听
onMessage('installPathSelected', (data: { path: string }) => {
  userSelectedPath.value = data.path;
});

onMessage('installationProgress', (data: { progress: number; message: string }) => {
  progress.value = data.progress;
  progressMessage.value = data.message;
});

onMessage('installationComplete', () => {
  isInstalling.value = false;
  progress.value = 100;
  progressMessage.value = 'Installation completed successfully!';
  setTimeout(() => {
    emit('installation-complete');
  }, 2000);
});

onMessage('installationError', (data: { error: string }) => {
  isInstalling.value = false;
  progressMessage.value = `Installation failed: ${data.error}`;
});
</script>

<style scoped>
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-spinner {
  animation: spin 1s linear infinite;
}
</style>
