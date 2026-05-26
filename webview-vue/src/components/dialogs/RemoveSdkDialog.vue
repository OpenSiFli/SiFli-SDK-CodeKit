<template>
  <div v-if="open" class="dialog-backdrop" @click="handleBackdropClick">
    <div class="dialog-panel border-red-500/30! shadow-[0_24px_60px_rgba(220,38,38,0.15)]!" @click.stop>
      <div class="dialog-header">
        <div>
          <h3 class="text-xl font-semibold text-vscode-foreground">{{ t('sdkDialogs.remove.title') }}</h3>
          <p class="mt-1 text-sm text-vscode-input-placeholder">
            {{ t('sdkDialogs.remove.preparing') }}
            <span class="font-semibold text-vscode-foreground">{{ sdkName }}</span>
          </p>
        </div>
        <button class="icon-button" @click="onClose">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>

      <div class="callout callout--danger mt-2 flex items-start gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clip-rule="evenodd"
          />
        </svg>
        <div class="text-sm">
          <strong class="block mb-1">{{ t('sdkDialogs.remove.destructiveTitle') }}</strong>
          {{ t('sdkDialogs.remove.descriptionBeforeStrong')
          }}<strong>{{ t('sdkDialogs.remove.descriptionStrong') }}</strong
          >{{ t('sdkDialogs.remove.descriptionAfterStrong') }}<br />
          {{ t('sdkDialogs.remove.confirmQuestion') }}
        </div>
      </div>

      <div class="mt-4 flex justify-end gap-3 border-t border-vscode-panel-border pt-4">
        <BaseButton variant="secondary" :disabled="busy" @click="onClose">{{ t('common.cancel') }}</BaseButton>
        <BaseButton variant="error" :disabled="busy" @click="onConfirm">
          <svg v-if="busy" class="button-spinner mr-2" viewBox="0 0 24 24"></svg>
          {{ t('sdkDialogs.remove.confirm') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/common/BaseButton.vue';

const { t } = useI18n();

interface Props {
  open: boolean;
  sdkName: string;
  busy?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

const onClose = () => {
  if (!props.busy) {
    emit('close');
  }
};

const handleBackdropClick = () => {
  if (!props.busy) {
    emit('close');
  }
};

const onConfirm = () => {
  if (!props.busy) {
    emit('confirm');
  }
};
</script>
