<template>
  <div class="min-h-screen bg-vscode-background text-vscode-foreground font-vscode relative overflow-hidden">
    <!-- 背景装饰 -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-green-500/10 to-blue-500/10 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2"></div>
      <div class="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-tl from-purple-500/10 to-pink-500/10 rounded-full blur-3xl transform translate-x-1/2 translate-y-1/2"></div>
    </div>

    <div class="relative z-10 p-8">
      <div class="max-w-4xl mx-auto">
        <!-- Header Section -->
        <div class="text-center mb-8">
          <!-- Success Icon -->
          <div class="inline-flex items-center justify-center w-24 h-24 mb-6 bg-green-500/20 rounded-full animate-pulse">
            <svg class="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>

          <!-- Title -->
          <h1 class="text-4xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent animate-fade-in">
            🎉 安装完成！
          </h1>
          
          <!-- Subtitle -->
          <p class="text-xl text-vscode-input-placeholder mb-2">
            SiFli SDK {{ sdkVersion }} 已成功安装
          </p>
          
          <!-- Install Path -->
          <div class="inline-flex items-center gap-2 px-4 py-2 bg-vscode-editor-background rounded-lg border border-vscode-editor-foreground/20">
            <svg class="w-4 h-4 text-vscode-input-placeholder" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 1v6"></path>
            </svg>
            <span class="text-sm font-mono text-vscode-input-placeholder">{{ installPath }}</span>
            <button
              @click="copyPath"
              class="p-1 hover:bg-vscode-button-hoverBackground rounded transition-colors"
              title="复制路径"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- Content Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Installation Summary Card -->
          <div class="vscode-card rounded-lg p-6 animate-slide-in-left">
            <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              安装摘要
            </h2>
            
            <div class="space-y-3">
              <div class="flex justify-between items-center py-2 border-b border-vscode-panel-border/30">
                <span class="text-vscode-input-placeholder">SDK 版本</span>
                <span class="font-medium">{{ sdkVersion }}</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-vscode-panel-border/30">
                <span class="text-vscode-input-placeholder">源码仓库</span>
                <span class="font-medium">{{ sdkSource === 'github' ? 'GitHub' : 'Gitee' }}</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-vscode-panel-border/30">
                <span class="text-vscode-input-placeholder">工具链状态</span>
                <span class="flex items-center gap-2">
                  <span class="w-2 h-2 bg-green-400 rounded-full"></span>
                  <span class="font-medium text-green-400">已安装</span>
                </span>
              </div>
              <div class="flex justify-between items-center py-2">
                <span class="text-vscode-input-placeholder">安装时间</span>
                <span class="font-medium">{{ formatInstallTime() }}</span>
              </div>
            </div>
          </div>

          <!-- Installation Log Card -->
          <div class="vscode-card rounded-lg p-6 animate-slide-in-right">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-semibold flex items-center gap-2">
                <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                安装日志
              </h2>
              <div class="flex items-center gap-2">
                <button
                  @click="toggleLogExpanded"
                  class="p-2 hover:bg-vscode-button-hoverBackground rounded transition-colors"
                  :title="isLogExpanded ? '收起日志' : '展开日志'"
                >
                  <svg 
                    class="w-4 h-4 transition-transform" 
                    :class="{ 'rotate-180': isLogExpanded }"
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </button>
                <button
                  @click="copyLogs"
                  class="p-2 hover:bg-vscode-button-hoverBackground rounded transition-colors"
                  title="复制日志"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                  </svg>
                </button>
              </div>
            </div>
            
            <!-- Log Window -->
            <div 
              ref="logContainer"
              class="bg-black/50 text-green-400 text-xs font-mono p-4 rounded border transition-all duration-300"
              :class="isLogExpanded ? 'max-h-96' : 'max-h-48'"
              style="scrollbar-width: thin; scrollbar-color: #4a5568 #2d3748;"
            >
              <div class="mb-2 text-gray-300 font-semibold border-b border-gray-600 pb-1">
                安装日志（{{ installationLogs.length }} 条）:
              </div>
              <div class="overflow-y-auto" :class="isLogExpanded ? 'max-h-80' : 'max-h-32'">
                <div 
                  v-for="(log, index) in installationLogs" 
                  :key="index" 
                  class="mb-1 leading-tight"
                >
                  <span class="text-gray-500 mr-2">[{{ formatLogTime(index) }}]</span>{{ log }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Next Steps Section -->
        <div class="mt-8 animate-fade-in-up" style="animation-delay: 0.5s;">
          <h2 class="text-2xl font-semibold mb-6 text-center">接下来你可以...</h2>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Open in Explorer -->
            <div class="vscode-card rounded-lg p-6 hover:bg-vscode-button-hoverBackground/30 transition-all duration-200 cursor-pointer group"
                 @click="openInExplorer">
              <div class="text-center">
                <div class="inline-flex items-center justify-center w-12 h-12 mb-4 bg-blue-500/20 rounded-full group-hover:bg-blue-500/30 transition-colors">
                  <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 1v6"></path>
                  </svg>
                </div>
                <h3 class="text-lg font-medium mb-2">打开安装目录</h3>
                <p class="text-sm text-vscode-input-placeholder">在文件管理器中查看已安装的 SDK</p>
              </div>
            </div>

            <!-- Open in Terminal -->
            <div class="vscode-card rounded-lg p-6 hover:bg-vscode-button-hoverBackground/30 transition-all duration-200 cursor-pointer group"
                 @click="openInTerminal">
              <div class="text-center">
                <div class="inline-flex items-center justify-center w-12 h-12 mb-4 bg-green-500/20 rounded-full group-hover:bg-green-500/30 transition-colors">
                  <svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2-2v16z"></path>
                  </svg>
                </div>
                <h3 class="text-lg font-medium mb-2">在终端中打开</h3>
                <p class="text-sm text-vscode-input-placeholder">使用终端开始你的开发之旅</p>
              </div>
            </div>

            <!-- Start New Installation -->
            <div class="vscode-card rounded-lg p-6 hover:bg-vscode-button-hoverBackground/30 transition-all duration-200 cursor-pointer group"
                 @click="startNewInstallation">
              <div class="text-center">
                <div class="inline-flex items-center justify-center w-12 h-12 mb-4 bg-purple-500/20 rounded-full group-hover:bg-purple-500/30 transition-colors">
                  <svg class="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                  </svg>
                </div>
                <h3 class="text-lg font-medium mb-2">安装其他版本</h3>
                <p class="text-sm text-vscode-input-placeholder">继续安装更多的 SDK 版本</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex justify-center gap-4 mt-8 animate-fade-in-up" style="animation-delay: 0.7s;">
          <BaseButton
            variant="secondary"
            size="lg"
            @click="$emit('go-back')"
            class="px-8"
          >
            返回主页
          </BaseButton>
          
          <BaseButton
            variant="primary"
            size="lg"
            @click="closeManager"
            class="px-8"
          >
            完成
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useVsCodeApi } from '@/composables/useVsCodeApi';
import BaseButton from '@/components/common/BaseButton.vue';

interface Props {
  sdkVersion: string;
  installPath: string;
  sdkSource: 'github' | 'gitee';
  installationLogs: string[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'go-back': []
  'new-installation': []
}>();

const { postMessage } = useVsCodeApi();

const logContainer = ref<HTMLElement>();
const isLogExpanded = ref(false);
const installStartTime = ref(new Date());

onMounted(() => {
  // 滚动日志到底部
  nextTick(() => {
    if (logContainer.value) {
      const scrollElement = logContainer.value.querySelector('.overflow-y-auto');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  });
});

// 格式化安装时间
const formatInstallTime = () => {
  return installStartTime.value.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// 格式化日志时间
const formatLogTime = (index: number) => {
  const baseTime = installStartTime.value.getTime();
  const logTime = new Date(baseTime + index * 1000); // 假设每条日志间隔1秒
  return logTime.toLocaleTimeString('zh-CN', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// 切换日志展开状态
const toggleLogExpanded = () => {
  isLogExpanded.value = !isLogExpanded.value;
};

// 复制安装路径
const copyPath = async () => {
  try {
    await navigator.clipboard.writeText(props.installPath);
    // 可以添加一个简单的提示
    console.log('路径已复制到剪贴板');
  } catch (error) {
    console.error('复制失败:', error);
  }
};

// 复制日志
const copyLogs = async () => {
  try {
    const logsText = props.installationLogs.join('\n');
    await navigator.clipboard.writeText(logsText);
    console.log('日志已复制到剪贴板');
  } catch (error) {
    console.error('复制日志失败:', error);
  }
};

// 在文件管理器中打开
const openInExplorer = () => {
  postMessage({
    command: 'openInExplorer',
    path: props.installPath
  });
};

// 在终端中打开
const openInTerminal = () => {
  postMessage({
    command: 'openInTerminal',
    path: props.installPath
  });
};

// 开始新的安装
const startNewInstallation = () => {
  emit('new-installation');
};

// 关闭管理器
const closeManager = () => {
  postMessage({
    command: 'closeManager'
  });
};
</script>

<style scoped>
/* 动画样式 */
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slide-in-left {
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slide-in-right {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.6s ease-out forwards;
  opacity: 0;
}

.animate-slide-in-left {
  animation: slide-in-left 0.8s ease-out forwards;
  opacity: 0;
}

.animate-slide-in-right {
  animation: slide-in-right 0.8s ease-out forwards;
  opacity: 0;
}

.animate-fade-in-up {
  animation: fade-in-up 0.8s ease-out forwards;
  opacity: 0;
}

/* 渐变文字效果 */
.bg-clip-text {
  -webkit-background-clip: text;
  background-clip: text;
}

/* 自定义滚动条 */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #2d3748;
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #4a5568;
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #636e7e;
}

/* 卡片悬停效果 */
.group:hover .group-hover\:bg-blue-500\/30 {
  background-color: rgba(59, 130, 246, 0.3);
}

.group:hover .group-hover\:bg-green-500\/30 {
  background-color: rgba(34, 197, 94, 0.3);
}

.group:hover .group-hover\:bg-purple-500\/30 {
  background-color: rgba(168, 85, 247, 0.3);
}
</style>
