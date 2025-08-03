<template>
  <div class="form-item animate-slide-in-up">
    <label class="block text-sm font-medium text-vscode-foreground mb-3 transition-colors duration-200">
      {{ $t('sdk.installPath.label') }}
    </label>
    
    <!-- 主输入区域 -->
    <div class="flex items-center gap-2 mb-3">
      <!-- 复合输入框 -->
      <div class="flex-1 relative">
        <!-- 输入框容器 -->
        <div class="flex border border-vscode-input-border rounded overflow-hidden bg-vscode-input-background focus-within:ring-2 focus-within:ring-vscode-focus-border focus-within:border-vscode-focus-border transition-all duration-200">
          <!-- 左侧输入区域 -->
          <div class="flex-1">
            <input
              v-model="installPath"
              type="text"
              :placeholder="defaultInstallPath"
              class="w-full px-3 py-2 bg-transparent text-vscode-input-foreground placeholder-vscode-input-placeholder border-0 outline-none"
              @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
            />
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
        {{ $t('common.browse') }}
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import BaseButton from '@/components/common/BaseButton.vue';
import { useVsCodeApi } from '@/composables/useVsCodeApi';

interface Props {
  modelValue: string;
  selectedVersion?: string;
  selectedBranch?: string;
  downloadType?: 'release' | 'branch';
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  browse: [];
}>();

const { postMessage, onMessage } = useVsCodeApi();
const defaultPath = ref('~/sifli');

const installPath = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
});

const defaultInstallPath = computed(() => defaultPath.value);

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

// 监听来自后端的默认路径
onMessage('defaultInstallPath', (data: { path: string }) => {
  defaultPath.value = data.path;
  // 如果当前没有设置路径，则使用默认路径
  if (!props.modelValue) {
    emit('update:modelValue', data.path);
  }
});

// 组件挂载时请求默认路径
onMounted(() => {
  // 请求后端获取默认安装路径
  postMessage({
    command: 'getDefaultInstallPath'
  });
});
</script>

<style scoped>
/* 动画样式 */
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

.animate-slide-in-up {
  animation: slide-in-up 0.5s ease-out forwards;
  opacity: 0;
}
</style>
