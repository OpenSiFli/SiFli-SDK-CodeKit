<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
    <div class="w-full max-w-lg rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-xl font-semibold">{{ t('sdkDialogs.rename.title') }}</h3>
          <p class="mt-1 text-sm text-vscode-input-placeholder">{{ t('sdkDialogs.rename.description') }}</p>
        </div>
        <button class="text-sm text-vscode-input-placeholder hover:text-vscode-foreground" @click="$emit('close')">
          {{ t('common.close') }}
        </button>
      </div>

      <div class="mt-6">
        <label class="mb-2 block text-sm font-medium">{{ t('sdkDialogs.rename.directoryName') }}</label>
        <BaseInput v-model="directoryName" :placeholder="t('sdkDialogs.rename.placeholder')" />
      </div>

      <div class="mt-6 flex flex-wrap justify-end gap-3">
        <BaseButton variant="secondary" @click="$emit('close')">{{ t('common.cancel') }}</BaseButton>
        <BaseButton
          variant="primary"
          :disabled="!directoryName.trim() || busy"
          :loading="busy"
          @click="$emit('confirm', directoryName.trim())"
        >
          {{ t('sdkDialogs.rename.confirm') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/common/BaseButton.vue';
import BaseInput from '@/components/common/BaseInput.vue';

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  initialName: string;
  busy?: boolean;
}>();

const directoryName = ref('');

watch(
  () => props.open,
  isOpen => {
    if (isOpen) {
      directoryName.value = props.initialName;
    }
  },
  { immediate: true }
);

defineEmits<{
  close: [];
  confirm: [directoryName: string];
}>();
</script>
