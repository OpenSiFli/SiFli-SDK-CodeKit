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
        <h1 class="text-3xl font-bold mb-2">{{ $t('advanced.title') }}</h1>
        <p class="text-vscode-input-placeholder text-sm">{{ $t('advanced.subtitle') }}</p>
      </header>

      <!-- Main Form -->
      <div class="vscode-card rounded-lg p-6 space-y-8 animate-fade-in-scale">
        <!-- SDK Source Selection -->
        <SdkSourceSelector
          v-model="sdkManager.state.value.sdkSource"
        />

        <!-- Toolchain Source Selection -->
        <ToolchainSourceSelector
          v-model="toolchainSource"
          :sdk-source="sdkManager.state.value.sdkSource"
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

        <!-- Toolchain Tools Path Selection -->
        <ToolsPathSelector
          v-model="toolsPath"
          @browse="browseToolsPath"
        />

        <!-- Installation Button -->
        <div class="pt-4 animate-slide-in-up" style="animation-delay: 0.4s;">
          <BaseButton
            variant="primary"
            size="lg"
            block
            :disabled="!sdkManager.isFormValid.value"
            :loading="sdkManager.state.value.isInstalling"
            @click="handleInstall"
          >
            <span v-if="sdkManager.state.value.isInstalling">Installing...</span>
            <span v-else">Install SiFli SDK</span>
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
import { useVsCodeApi } from '@/composables/useVsCodeApi';
import BaseButton from '@/components/common/BaseButton.vue';
import SdkSourceSelector from '@/components/sdk/SdkSourceSelector.vue';
import ToolchainSourceSelector from '@/components/sdk/ToolchainSourceSelector.vue';
import ToolsPathSelector from '@/components/sdk/ToolsPathSelector.vue';
import DownloadTypeSelector from '@/components/sdk/DownloadTypeSelector.vue';
import SdkVersionSelector from '@/components/sdk/SdkVersionSelector.vue';
import InstallPathSelector from '@/components/sdk/InstallPathSelector.vue';

// 定义 emits
const emit = defineEmits<{
  'go-back': []
  'installation-complete': []
}>();

const { postMessage, onMessage } = useVsCodeApi();

// 工具链下载源
const toolchainSource = ref<'sifli' | 'github'>('sifli');

// 工具链目录路径
const toolsPath = ref('');

const sdkManager = useSdkManager();

// 浏览工具链路径
const browseToolsPath = () => {
  postMessage({
    command: 'browseToolsPath'
  });
};

// 监听工具链路径选择结果
onMessage('toolsPathSelected', (data: { path: string }) => {
  toolsPath.value = data.path;
});

const handleInstall = async () => {
  try {
    // 传递工具链相关配置给后端
    console.log('Toolchain source:', toolchainSource.value);
    console.log('Tools path:', toolsPath.value);
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
