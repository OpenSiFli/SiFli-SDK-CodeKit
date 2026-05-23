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
        <label class="mb-2 block text-sm font-medium">{{ t(field.labelKey) }}</label>
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
import { useI18n } from 'vue-i18n';
import BaseInput from '@/components/common/BaseInput.vue';
import BaseSelect from '@/components/common/BaseSelect.vue';
import type { ToolchainMirrorUrls, ToolchainSource } from '@/types';
import { TOOLCHAIN_MIRROR_FIELDS, getMirrorValidationIssue, normalizeMirrorUrls } from '@/utils/toolchainMirror';

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

const { t } = useI18n();

const source = computed(() => props.source ?? 'github');
const mirrorUrls = computed(() => normalizeMirrorUrls(props.mirrorUrls));
const sourceOptions = computed<Array<{ value: ToolchainSource; label: string }>>(() => [
  { value: 'github', label: t('sdk.toolchainMirror.mode.github') },
  { value: 'sifli', label: t('sdk.toolchainMirror.mode.sifli') },
  { value: 'custom', label: t('sdk.toolchainMirror.mode.custom') },
]);
const validationMessage = computed(() => {
  const issue = getMirrorValidationIssue(source.value, mirrorUrls.value);
  if (!issue) {
    return '';
  }
  if (issue.type === 'required') {
    return t('sdk.toolchainMirror.validation.required');
  }
  return t('sdk.toolchainMirror.validation.invalidUrl', {
    field: issue.field ? t(issue.field.labelKey) : '',
  });
});

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
