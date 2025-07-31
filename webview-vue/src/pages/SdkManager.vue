<template>
  <div class="min-h-screen bg-vscode-background text-vscode-foreground font-vscode p-8">
    <div class="max-w-2xl mx-auto">
      <!-- 页面头部 -->
      <header class="text-center mb-8 pb-6 border-b border-vscode-panel-border">
        <div class="w-16 h-16 mx-auto mb-4 bg-vscode-button-background rounded-lg flex items-center justify-center">
          <img 
            :src="logoSrc" 
            alt="SiFli Logo" 
            class="w-12 h-12 rounded"
          />
        </div>
        <h1 class="text-3xl font-bold mb-2">SiFli SDK 管理器</h1>
        <p class="text-vscode-input-placeholder">简化 SiFli SDK 的下载、安装与管理</p>
      </header>

      <!-- 主要表单 -->
      <div class="vscode-card rounded-lg p-6 space-y-6">
        <!-- SDK 来源选择 -->
        <SdkSourceSelector
          v-model="sdkManager.state.value.sdkSource"
        />

        <!-- 下载类型选择 -->
        <DownloadTypeSelector
          v-model="sdkManager.state.value.downloadType"
        />

        <!-- 版本/分支选择 -->
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

        <!-- 安装路径选择 -->
        <InstallPathSelector
          v-model="sdkManager.state.value.installPath"
          @browse="sdkManager.browsePath"
        />

        <!-- 安装按钮 -->
        <div class="pt-4">
          <BaseButton
            variant="primary"
            size="lg"
            block
            :disabled="!sdkManager.isFormValid.value"
            :loading="sdkManager.state.value.isInstalling"
            @click="sdkManager.installSdk"
          >
            <span v-if="sdkManager.state.value.isInstalling">安装中...</span>
            <span v-else>安装 SDK</span>
          </BaseButton>
        </div>
      </div>

      <!-- 加载状态指示器 -->
      <Transition name="fade">
        <div v-if="sdkManager.state.value.isLoading" class="text-center mt-4">
          <div class="loading loading-spinner loading-md text-vscode-button-background"></div>
          <p class="text-sm text-vscode-input-placeholder mt-2">正在加载选项...</p>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useSdkManager } from '@/composables/useSdkManager';
import BaseButton from '@/components/common/BaseButton.vue';
import SdkSourceSelector from '@/components/sdk/SdkSourceSelector.vue';
import DownloadTypeSelector from '@/components/sdk/DownloadTypeSelector.vue';
import SdkVersionSelector from '@/components/sdk/SdkVersionSelector.vue';
import InstallPathSelector from '@/components/sdk/InstallPathSelector.vue';

// 直接引入 Logo 图片
import logoSrc from '@/assets/images/SiFli.png';

const sdkManager = useSdkManager();

onMounted(() => {
  sdkManager.initialize();
});
</script>
