<template>
  <Transition name="fade" mode="out-in">
    <div v-if="downloadType === 'release'" key="release" class="form-control w-full">
      <label class="label">
        <span class="label-text text-vscode-foreground">SDK 版本</span>
      </label>
      <BaseSelect
        v-model="selectedVersion"
        :options="releaseOptions"
        :disabled="isLoading"
        placeholder="正在加载版本..."
        @update:modelValue="$emit('update:version', $event)"
      />
    </div>
    <div v-else-if="downloadType === 'branch'" key="branch" class="form-control w-full">
      <label class="label">
        <span class="label-text text-vscode-foreground">SDK 分支</span>
      </label>
      <BaseSelect
        v-model="selectedBranch"
        :options="branchOptions"
        :disabled="isLoading"
        placeholder="正在加载分支..."
        @update:modelValue="$emit('update:branch', $event)"
      />
    </div>
  </Transition>
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

const releaseOptions = computed(() => [
  { value: '', label: '请选择一个版本', disabled: true },
  ...props.releases.map(release => ({
    value: release.tagName,
    label: release.tagName
  }))
]);

const branchOptions = computed(() => [
  { value: '', label: '请选择一个分支', disabled: true },
  ...props.branches.map(branch => ({
    value: branch.name,
    label: branch.name
  }))
]);
</script>
