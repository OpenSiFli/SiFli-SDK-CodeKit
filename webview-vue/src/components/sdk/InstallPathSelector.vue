<template>
  <div class="form-item animate-slide-in-up" style="animation-delay: 0.3s;">
    <label class="block text-sm font-medium text-vscode-foreground mb-3 transition-colors duration-200">
      Enter SiFli SDK container directory:
    </label>
    
    <!-- 主输入区域 -->
    <div class="flex items-center gap-2 mb-3">
      <!-- 复合输入框 -->
      <div class="flex-1 relative">
        <!-- 输入框容器 -->
        <div class="flex border border-vscode-input-border rounded overflow-hidden bg-vscode-input-background focus-within:ring-2 focus-within:ring-vscode-focus-border focus-within:border-vscode-focus-border transition-all duration-200">
          <!-- 左侧输入区域 -->
          <div class="flex-1 relative">
            <input
              v-model="installPath"
              type="text"
              placeholder="/Users/username/sifli-sdk"
              class="w-full px-3 py-2 bg-transparent text-vscode-input-foreground placeholder-vscode-input-placeholder border-0 outline-none"
              @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
            />
            <!-- 建议路径按钮 -->
            <div class="absolute right-2 top-1/2 transform -translate-y-1/2">
              <button
                @click="showSuggestions = !showSuggestions"
                class="text-vscode-input-placeholder hover:text-vscode-foreground transition-colors duration-200 p-1"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>
            </div>
          </div>
          
          <!-- 右侧后缀区域 -->
          <div v-if="pathSuffix" class="border-l border-vscode-input-border bg-vscode-input-background bg-opacity-50">
            <div class="px-3 py-2 text-vscode-input-placeholder font-mono text-sm whitespace-nowrap">
              /{{ pathSuffix }}
            </div>
          </div>
        </div>
      </div>
      
      <!-- 浏览按钮 -->
      <BaseButton
        variant="secondary"
        @click="$emit('browse')"
        class="px-4"
      >
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"></path>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5a2 2 0 012-2h2a2 2 0 012 2v1H8V5z"></path>
        </svg>
        Browse
      </BaseButton>
    </div>

    <!-- 建议路径下拉菜单 -->
    <Transition name="slide-down">
      <div v-if="showSuggestions" class="mb-3 border border-vscode-panel-border rounded-lg overflow-hidden bg-vscode-input-background">
        <div class="p-2 text-xs text-vscode-input-placeholder border-b border-vscode-panel-border">
          Suggested paths:
        </div>
        <div class="max-h-32 overflow-y-auto">
          <button
            v-for="suggestion in pathSuggestions"
            :key="suggestion.path"
            @click="selectSuggestion(suggestion.path)"
            class="w-full text-left px-3 py-2 hover:bg-vscode-background transition-colors duration-200 flex items-center justify-between group"
          >
            <div>
              <div class="text-sm text-vscode-foreground font-mono">{{ suggestion.path }}</div>
              <div class="text-xs text-vscode-input-placeholder">{{ suggestion.description }}</div>
            </div>
            <svg class="w-4 h-4 text-vscode-input-placeholder group-hover:text-vscode-foreground transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </button>
        </div>
      </div>
    </Transition>
    
    <!-- 最终路径预览 -->
    <div v-if="finalPath" class="p-4 bg-vscode-input-background border border-vscode-panel-border rounded-lg">
      <div class="flex items-center gap-2 mb-2">
        <div class="w-2 h-2 bg-green-500 rounded-full"></div>
        <span class="text-sm font-medium text-vscode-foreground">Installation target:</span>
      </div>
      <div class="bg-vscode-background border border-vscode-input-border rounded p-3">
        <div class="text-sm font-mono text-vscode-foreground break-all leading-relaxed">
          {{ finalPath }}
        </div>
      </div>
    </div>
    
    <!-- 如果没有选择版本的提示 -->
    <div v-else-if="modelValue && !pathSuffix" class="p-4 bg-yellow-500 bg-opacity-5 border border-yellow-500 border-opacity-20 rounded-lg">
      <div class="flex items-center gap-2 mb-1">
        <div class="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
        <span class="text-sm font-medium text-yellow-400">Waiting for version selection</span>
      </div>
      <div class="text-xs text-vscode-input-placeholder">
        Please select a version or branch to see the complete installation path
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import BaseButton from '@/components/common/BaseButton.vue';

interface Props {
  modelValue: string;
  finalPath?: string;
  selectedVersion?: string;
  selectedBranch?: string;
  downloadType?: 'release' | 'branch';
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  browse: [];
}>();

// 响应式数据
const showSuggestions = ref(false);

const installPath = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
});

// 计算路径后缀
const pathSuffix = computed(() => {
  if (props.downloadType === 'release' && props.selectedVersion) {
    return `SiFli-SDK/${props.selectedVersion}`;
  } else if (props.downloadType === 'branch' && props.selectedBranch) {
    // 处理分支名称，移除 'release/' 前缀
    let folderName = props.selectedBranch;
    if (folderName.startsWith('release/')) {
      folderName = folderName.replace('release/', '');
    }
    return `SiFli-SDK/${folderName}`;
  }
  return '';
});

// 路径建议
const pathSuggestions = computed(() => {
  const homeDir = '/Users/' + (typeof navigator !== 'undefined' ? 'username' : 'user');
  
  return [
    {
      path: `${homeDir}/sifli-sdk`,
      description: 'Home directory (recommended)'
    },
    {
      path: `${homeDir}/Documents/sifli-sdk`,
      description: 'Documents folder'
    },
    {
      path: `${homeDir}/Desktop/sifli-sdk`,
      description: 'Desktop folder'
    },
    {
      path: '/opt/sifli-sdk',
      description: 'System-wide installation'
    },
    {
      path: `${homeDir}/dev/sifli-sdk`,
      description: 'Development folder'
    }
  ];
});

// 方法
const selectSuggestion = (path: string) => {
  installPath.value = path;
  showSuggestions.value = false;
};
</script>

<style scoped>
.form-item {
  transition: all 0.3s ease;
}

.form-item:hover {
  transform: translateX(2px);
}

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

.animate-slide-in-up {
  animation: slideInUp 0.5s ease-out;
}

/* 下拉动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 输入框样式优化 */
.relative input {
  padding-right: 2.5rem;
}

/* 建议按钮悬停效果 */
button:hover svg {
  transform: rotate(180deg);
  transition: transform 0.2s ease;
}
</style>
