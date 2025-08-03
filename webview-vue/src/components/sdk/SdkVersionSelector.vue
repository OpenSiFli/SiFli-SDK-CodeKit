<template>
  <div class="form-item animate-slide-in-up">
    <label class="block text-sm font-medium text-vscode-foreground mb-2 transition-colors duration-200">
      {{ downloadType === 'release' ? 'SDK 版本' : 'SDK 分支' }}
    </label>
    
    <div v-if="isLoading" class="flex items-center justify-center py-3 px-4 bg-vscode-input-background border border-vscode-input-border rounded-md">
      <div class="loading loading-spinner loading-sm mr-2"></div>
      <span class="text-vscode-input-placeholder">
        {{ downloadType === 'release' ? '正在加载版本...' : '正在加载分支...' }}
      </span>
    </div>
    
    <Transition v-else name="fade" mode="out-in">
      <BaseSelect
        v-if="downloadType === 'release'"
        key="release"
        v-model="selectedVersion"
        :options="releaseOptions"
        placeholder="请选择一个版本"
        @update:modelValue="handleVersionUpdate"
      />
      <BaseSelect
        v-else
        key="branch"
        v-model="selectedBranch"
        :options="branchOptions"
        placeholder="请选择一个分支"
        @update:modelValue="handleBranchUpdate"
      />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import BaseSelect from '@/components/common/BaseSelect.vue';
import type { DownloadType, SdkRelease, SdkBranch } from '@/types';

interface Props {
  downloadType: DownloadType;
  releases: SdkRelease[];
  branches: SdkBranch[];
  selectedVersion: string;
  selectedBranch: string;
  isLoading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:version': [value: string];
  'update:branch': [value: string];
}>();

const selectedVersion = computed({
  get: () => props.selectedVersion,
  set: (value: string) => emit('update:version', value)
});

const selectedBranch = computed({
  get: () => props.selectedBranch,
  set: (value: string) => emit('update:branch', value)
});

const releaseOptions = computed(() => 
  props.releases
    .filter(release => release.tagName && release.tagName.trim() !== '')
    .map(release => ({
      value: release.tagName,
      label: release.name || release.tagName
    }))
);

const branchOptions = computed(() => 
  props.branches
    .filter(branch => branch.name && branch.name.trim() !== '')
    .map(branch => ({
      value: branch.name,
      label: branch.name
    }))
);

const handleVersionUpdate = (value: string) => {
  emit('update:version', value);
};

const handleBranchUpdate = (value: string) => {
  emit('update:branch', value);
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
  animation: slideInUp 0.5s ease-out forwards;
  opacity: 0;
}

/* Fade transition for content switching */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.loading-spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
