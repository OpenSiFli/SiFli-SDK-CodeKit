<template>
  <div class="space-y-4">
    <BaseSelect
      :model-value="source"
      :options="sourceOptions"
      :disabled="disabled"
      @update:model-value="updateSource"
    />

    <div v-if="source === 'custom'" class="grid gap-4 border-l border-vscode-panel-border pl-4">
      <div v-for="field in TOOLCHAIN_MIRROR_FIELDS" :key="field.key">
        <label class="mb-2 block text-sm font-medium">{{ field.label }}</label>
        <BaseInput
          :model-value="mirrorUrls[field.key] || ''"
          :placeholder="field.placeholder"
          :disabled="disabled"
          @update:model-value="value => updateMirrorUrl(field.key, value)"
        />
      </div>

      <p v-if="validationMessage" class="text-sm text-red-300">{{ validationMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import BaseInput from '@/components/common/BaseInput.vue';
import BaseSelect from '@/components/common/BaseSelect.vue';
import type { ToolchainMirrorUrls, ToolchainSource } from '@/types';
import { TOOLCHAIN_MIRROR_FIELDS, normalizeMirrorUrls, validateMirrorConfig } from '@/utils/toolchainMirror';

interface Props {
  source?: ToolchainSource;
  mirrorUrls?: ToolchainMirrorUrls;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  source: 'github',
  disabled: false,
});

const emit = defineEmits<{
  'update:source': [value: ToolchainSource];
  'update:mirrorUrls': [value: ToolchainMirrorUrls];
}>();

const sourceOptions: Array<{ value: ToolchainSource; label: string }> = [
  { value: 'github', label: '上游默认' },
  { value: 'sifli', label: 'SiFli 国内镜像' },
  { value: 'custom', label: '手动镜像 URL' },
];

const source = computed(() => props.source ?? 'github');
const mirrorUrls = computed(() => normalizeMirrorUrls(props.mirrorUrls));
const validationMessage = computed(() => validateMirrorConfig(source.value, mirrorUrls.value));

function updateSource(value: string) {
  emit('update:source', value as ToolchainSource);
}

function updateMirrorUrl(key: keyof ToolchainMirrorUrls, value: string) {
  emit('update:mirrorUrls', {
    ...mirrorUrls.value,
    [key]: value,
  });
}
</script>
