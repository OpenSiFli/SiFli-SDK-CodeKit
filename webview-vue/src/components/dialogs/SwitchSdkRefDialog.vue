<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
    <div class="w-full max-w-xl rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-xl font-semibold">{{ t('sdkDialogs.switchRef.title') }}</h3>
          <p class="mt-1 text-sm text-vscode-input-placeholder">{{ t('sdkDialogs.switchRef.description') }}</p>
        </div>
        <button class="text-sm text-vscode-input-placeholder hover:text-vscode-foreground" @click="$emit('close')">
          {{ t('common.close') }}
        </button>
      </div>

      <div class="mt-6 space-y-4">
        <div>
          <label class="mb-2 block text-sm font-medium">{{ t('sdkDialogs.switchRef.targetVersion') }}</label>
          <BaseSelect
            v-model="selectedTargetRef"
            :options="targetOptions"
            :placeholder="t('sdkDialogs.switchRef.targetVersionPlaceholder')"
          />
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium">{{ t('sdkDialogs.switchRef.directoryName') }}</label>
          <BaseInput v-model="directoryName" :placeholder="t('sdkDialogs.switchRef.directoryNamePlaceholder')" />
        </div>
      </div>

      <div class="mt-6 flex flex-wrap justify-end gap-3">
        <BaseButton variant="secondary" @click="$emit('close')">{{ t('common.cancel') }}</BaseButton>
        <BaseButton
          variant="primary"
          :disabled="!selectedTarget || !directoryName.trim() || busy"
          :loading="busy"
          @click="handleConfirm"
        >
          {{ t('sdkDialogs.switchRef.confirm') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/common/BaseButton.vue';
import BaseInput from '@/components/common/BaseInput.vue';
import BaseSelect from '@/components/common/BaseSelect.vue';
import type { SdkTarget } from '@/types';

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  targets: SdkTarget[];
  initialDirectoryName: string;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [payload: { targetRef: string; targetKind: 'branch' | 'tag'; directoryName: string }];
}>();

const selectedTargetRef = ref('');
const directoryName = ref('');

const targetOptions = computed(() =>
  props.targets.map(item => ({
    value: item.ref,
    label: `${t(`sdk.targetKind.${item.kind}`)} · ${item.label}`,
  }))
);

const selectedTarget = computed(() => props.targets.find(item => item.ref === selectedTargetRef.value) ?? null);

watch(
  () => props.open,
  isOpen => {
    if (!isOpen) {
      return;
    }

    selectedTargetRef.value = props.targets[0]?.ref ?? '';
    directoryName.value = props.initialDirectoryName;
  },
  { immediate: true }
);

watch(selectedTarget, target => {
  if (target) {
    directoryName.value = target.defaultDirectoryName;
  }
});

function handleConfirm() {
  if (!selectedTarget.value) {
    return;
  }

  emit('confirm', {
    targetRef: selectedTarget.value.ref,
    targetKind: selectedTarget.value.kind,
    directoryName: directoryName.value.trim(),
  });
}
</script>
