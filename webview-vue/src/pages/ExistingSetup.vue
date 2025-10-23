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
        <div class="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <img 
            :src="logoSrc" 
            alt="SiFli Logo" 
            class="w-14 h-14 object-contain"
          />
        </div>
        <h1 class="text-3xl font-bold mb-2">{{ $t('existing.title') }}</h1>
        <p class="text-vscode-input-placeholder text-sm">{{ $t('existing.subtitle') }}</p>
      </header>

      <!-- Main Form -->
      <div class="vscode-card rounded-lg p-6 space-y-6 animate-fade-in-scale">
        <!-- Toolchain Source Selection -->
        <ToolchainSourceSelector
          v-model="toolchainSource"
        />

        <!-- SDK Container Path -->
        <div class="form-item">
          <label class="block text-sm font-medium mb-2">
            SiFli SDK 容器目录
            <span class="text-vscode-input-placeholder text-xs ml-1">(SDK 根目录)</span>
          </label>
          <div class="flex gap-2">
            <input
              v-model="sdkContainerPath"
              type="text"
              placeholder="请选择 SDK 容器目录"
              class="flex-1 bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded px-3 py-2 focus:outline-none focus:border-vscode-focus-border"
              @blur="validateSdkPath"
            />
            <BaseButton
              variant="secondary"
              @click="browseSdkPath"
            >
              浏览
            </BaseButton>
          </div>
          <!-- Validation Message -->
          <div v-if="validationMessage" :class="[
            'mt-2 text-sm flex items-center gap-2',
            validationStatus === 'valid' ? 'text-green-500' : 'text-red-500'
          ]">
            <svg v-if="validationStatus === 'valid'" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
            </svg>
            <span>{{ validationMessage }}</span>
          </div>
          <!-- SDK Version Info -->
          <div v-if="sdkVersion" class="mt-2 text-sm text-vscode-input-placeholder">
            检测到版本: <span class="text-vscode-foreground font-medium">{{ sdkVersion }}</span>
          </div>
        </div>

        <!-- Tools Path -->
        <div class="form-item">
          <label class="block text-sm font-medium mb-2">
            SiFli SDK 工具链目录 (SIFLI_SDK_TOOLS_PATH)
            <span class="text-vscode-input-placeholder text-xs ml-1">(可选)</span>
          </label>
          <div class="flex gap-2">
            <input
              v-model="toolsPath"
              type="text"
              placeholder="留空使用默认工具链路径"
              class="flex-1 bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded px-3 py-2 focus:outline-none focus:border-vscode-focus-border"
            />
            <BaseButton
              variant="secondary"
              @click="browseToolsPath"
            >
              浏览
            </BaseButton>
          </div>
        </div>

        <!-- Install Button and Progress -->
        <div class="pt-4">
          <!-- Installation Log Window -->
          <div v-if="isInstalling" class="mb-4 p-4 bg-vscode-editor-background border border-vscode-editor-foreground/20 rounded">
            <div class="flex items-center mb-2">
              <div class="loading loading-spinner loading-sm text-vscode-button-background mr-2"></div>
              <span class="text-sm font-medium">{{ installationProgress }}</span>
            </div>
            
            <!-- Log Window -->
            <div 
              ref="logContainer"
              class="mt-3 bg-black/50 text-green-400 text-xs font-mono p-3 rounded border max-h-64 overflow-y-auto scroll-smooth"
              style="scrollbar-width: thin; scrollbar-color: #4a5568 #2d3748;"
            >
              <div class="mb-2 text-gray-300 font-semibold border-b border-gray-600 pb-1">安装日志:</div>
              <div v-for="(log, index) in installationLogs" :key="index" class="mb-1 leading-tight">
                <span class="text-gray-500 mr-2">[{{ getTimestamp() }}]</span>{{ log }}
              </div>
              <div v-if="installationLogs.length === 0" class="text-gray-500 italic">
                等待日志输出...
              </div>
            </div>
          </div>

          <!-- Install Button -->
          <div class="flex gap-3">
            <BaseButton
              variant="primary"
              size="lg"
              :disabled="!isFormValid || isInstalling"
              :loading="isInstalling"
              @click="handleInstall"
              class="flex-1"
            >
              {{ isInstalling ? '安装中...' : '安装并配置 SDK' }}
            </BaseButton>
            
            <!-- Cancel Button -->
            <BaseButton
              v-if="isInstalling"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useVsCodeApi } from '@/composables/useVsCodeApi';
import BaseButton from '@/components/common/BaseButton.vue';
import ToolchainSourceSelector from '@/components/sdk/ToolchainSourceSelector.vue';
import logoSrc from '@/assets/images/SiFli.png';

const emit = defineEmits<{
  'go-back': []
  'installation-complete': []
}>();

const { postMessage, onMessage } = useVsCodeApi();

const toolchainSource = ref<'sifli' | 'github'>('sifli');
const sdkContainerPath = ref('');
const toolsPath = ref('');
const validationStatus = ref<'valid' | 'invalid' | ''>('');
const validationMessage = ref('');
const sdkVersion = ref('');
const isInstalling = ref(false);
const installationProgress = ref('');
const installationLogs = ref<string[]>([]);
const logContainer = ref<HTMLElement>();

const isFormValid = computed(() => {
  return validationStatus.value === 'valid' && !isInstalling.value;
});

// Browse SDK Path
const browseSdkPath = () => {
  postMessage({
    command: 'browseInstallPath'
  });
};

// Browse Tools Path
const browseToolsPath = () => {
  postMessage({
    command: 'browseToolsPath'
  });
};

// Validate SDK Path
const validateSdkPath = () => {
  if (!sdkContainerPath.value) {
    validationStatus.value = '';
    validationMessage.value = '';
    sdkVersion.value = '';
    return;
  }

  postMessage({
    command: 'validateExistingSdk',
    path: sdkContainerPath.value
  });
};

// Handle Install
const handleInstall = () => {
  if (!isFormValid.value) {
    return;
  }

  isInstalling.value = true;
  installationProgress.value = '准备安装...';
  installationLogs.value = [];

  postMessage({
    command: 'installExistingSdk',
    data: {
      sdkPath: sdkContainerPath.value,
      toolchainSource: toolchainSource.value,
      toolsPath: toolsPath.value
    }
  });
};

// Handle Cancel
const handleCancelInstall = () => {
  postMessage({
    command: 'cancelInstallation'
  });
};

// Get Timestamp
const getTimestamp = () => {
  const now = new Date();
  return now.toLocaleTimeString('zh-CN', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// Watch logs and scroll to bottom
watch(
  () => installationLogs.value,
  () => {
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight;
      }
    });
  },
  { deep: true }
);

// Listen for messages
onMessage('installPathSelected', (data: { path: string }) => {
  sdkContainerPath.value = data.path;
  validateSdkPath();
});

onMessage('toolsPathSelected', (data: { path: string }) => {
  toolsPath.value = data.path;
});

onMessage('sdkValidationResult', (data: { valid: boolean; message: string; version?: string }) => {
  validationStatus.value = data.valid ? 'valid' : 'invalid';
  validationMessage.value = data.message;
  sdkVersion.value = data.version || '';
});

onMessage('installationLog', (data: { log: string }) => {
  installationLogs.value.push(data.log);
});

onMessage('installationProgress', (data: { message: string }) => {
  installationProgress.value = data.message;
});

onMessage('installationCompleted', (data: { message: string; path: string }) => {
  isInstalling.value = false;
  emit('installation-complete');
});

onMessage('installationFailed', (data: { message: string }) => {
  isInstalling.value = false;
  installationProgress.value = data.message;
});
</script>

<style scoped>
.form-item {
  animation: slide-in-up 0.5s ease-out forwards;
  opacity: 0;
}

.form-item:nth-child(1) { animation-delay: 0.1s; }
.form-item:nth-child(2) { animation-delay: 0.2s; }
.form-item:nth-child(3) { animation-delay: 0.3s; }

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

.animate-fade-in-scale {
  animation: fade-in-scale 0.3s ease-out;
}

@keyframes fade-in-scale {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.vscode-card {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.loading {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

.loading-sm {
  width: 1.25rem;
  height: 1.25rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
