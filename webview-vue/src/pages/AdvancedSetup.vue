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

        <!-- Installation Button and Progress -->
        <div class="pt-4 animate-slide-in-up" style="animation-delay: 0.4s;">
          <!-- Installation Log Window -->
          <div v-if="sdkManager.state.value.isInstalling" class="mb-4 p-4 bg-vscode-editor-background border border-vscode-editor-foreground/20 rounded">
            <div class="flex items-center mb-2">
              <div class="loading loading-spinner loading-sm text-vscode-button-background mr-2"></div>
              <span class="text-sm font-medium">{{ sdkManager.state.value.installationProgress.message }}</span>
            </div>
            
            <!-- 日志窗口 -->
            <div 
              ref="logContainer"
              class="mt-3 bg-black/50 text-green-400 text-xs font-mono p-3 rounded border max-h-64 overflow-y-auto scroll-smooth"
              style="scrollbar-width: thin; scrollbar-color: #4a5568 #2d3748;"
            >
              <div class="mb-2 text-gray-300 font-semibold border-b border-gray-600 pb-1">安装日志:</div>
              <div v-for="(log, index) in sdkManager.state.value.installationLogs" :key="index" class="mb-1 leading-tight">
                <span class="text-gray-500 mr-2">[{{ getTimestamp() }}]</span>{{ log }}
              </div>
              <div v-if="sdkManager.state.value.installationLogs.length === 0" class="text-gray-500 italic">
                等待日志输出...
              </div>
            </div>
          </div>

          <!-- Install Button -->
          <div class="flex gap-3">
            <BaseButton
              variant="primary"
              size="lg"
              :disabled="!sdkManager.isFormValid.value || sdkManager.state.value.isInstalling"
              :loading="sdkManager.state.value.isInstalling"
              @click="handleInstall"
              class="flex-1"
            >
              {{ sdkManager.state.value.isInstalling ? 'Installing...' : 'Install SiFli SDK' }}
            </BaseButton>
            
            <!-- 取消按钮 -->
            <BaseButton
              v-if="sdkManager.state.value.isInstalling"
              variant="secondary"
              size="lg"
              @click="handleCancelInstall"
              class="px-6"
            >
              取消
            </BaseButton>
          </div>
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
import { ref, onMounted, watch, nextTick } from 'vue';
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

// 日志容器的引用
const logContainer = ref<HTMLElement>();

const sdkManager = useSdkManager();

// 监听日志变化，自动滚动到底部
watch(
  () => sdkManager.state.value.installationLogs,
  () => {
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight;
      }
    });
  },
  { deep: true }
);

// 获取当前时间戳
const getTimestamp = () => {
  const now = new Date();
  return now.toLocaleTimeString('zh-CN', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

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

const handleInstall = () => {
  try {
    // 设置工具链配置到 SDK 管理器状态
    sdkManager.state.value.toolchainSource = toolchainSource.value === 'github' ? 'github' : 'gitee';
    sdkManager.state.value.toolsPath = toolsPath.value;
    
    console.log('[AdvancedSetup] Starting SDK installation...');
    console.log('[AdvancedSetup] Tools path:', toolsPath.value);
    console.log('[AdvancedSetup] Will set SIFLI_SDK_TOOLS_PATH env var:', toolsPath.value && toolsPath.value.trim() !== '');
    
    // 调用安装方法（这是异步的，通过消息处理）
    sdkManager.installSdk();
    
  } catch (error) {
    console.error('Installation failed:', error);
  }
};

// 取消安装
const handleCancelInstall = () => {
  console.log('[AdvancedSetup] Cancelling SDK installation...');
  postMessage({
    command: 'cancelInstallation'
  });
};

onMounted(() => {
  sdkManager.initialize();
});
</script>
