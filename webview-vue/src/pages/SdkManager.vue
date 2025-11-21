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
    <ExistingSetup
      v-else-if="currentPage === 'existing'"
      @go-back="currentPage = 'welcome'"
      @installation-complete="handleInstallationComplete"
    />

    <!-- Installation Error Page -->
    <InstallationError
      v-else-if="currentPage === 'error'"
      :message="failureInfo.message"
      :logs="failureInfo.logs"
      @go-back="currentPage = 'welcome'"
    />

    <!-- Installation Complete Page -->
    <InstallationComplete
      v-else-if="currentPage === 'complete'"
      :sdk-version="installationResult.sdkVersion"
      :install-path="installationResult.installPath"
      :sdk-source="installationResult.sdkSource"
      :installation-logs="installationResult.logs"
      @go-back="currentPage = 'welcome'"
      @new-installation="currentPage = 'welcome'"
    />

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
import ExistingSetup from './ExistingSetup.vue';
import InstallationComplete from './InstallationComplete.vue';
import InstallationError from './InstallationError.vue';

type PageType = 'welcome' | 'express' | 'advanced' | 'existing' | 'success' | 'complete' | 'error';

interface InstallationResult {
  sdkVersion: string;
  installPath: string;
  sdkSource: 'github' | 'gitee';
  logs: string[];
}

const currentPage = ref<PageType>('welcome');
const { isReady, onMessage } = useVsCodeApi();
const installationResult = ref<InstallationResult>({
  sdkVersion: '',
  installPath: '',
  sdkSource: 'github',
  logs: []
});
const failureInfo = ref<{ message: string; logs: string[] }>({
  message: '',
  logs: []
});

const handleModeSelected = (mode: string) => {
  if (mode === 'express') {
    currentPage.value = 'express';
  } else if (mode === 'advanced') {
    currentPage.value = 'advanced';
  } else if (mode === 'existing') {
    currentPage.value = 'existing';
  }
};

const handleInstallationComplete = (data?: any) => {
  // 如果有数据传入，使用传入的数据，否则使用成功页面
  if (data) {
    currentPage.value = 'complete';
  } else {
    currentPage.value = 'success';
  }
};

// 监听安装完成事件
onMessage('installationCompleted', (data: { message: string; path: string; version?: string; source?: string; logs?: string[] }) => {
  installationResult.value = {
    sdkVersion: data.version || 'Unknown',
    installPath: data.path,
    sdkSource: (data.source as 'github' | 'gitee') || 'github',
    logs: data.logs || []
  };
  failureInfo.value = { message: '', logs: [] };
  currentPage.value = 'complete';
});

// 监听安装失败事件，跳转到错误页并展示日志
onMessage('installationFailed', (data: { message: string; logs?: string[] }) => {
  failureInfo.value = {
    message: data.message || '安装失败',
    logs: data.logs || []
  };
  currentPage.value = 'error';
});

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
