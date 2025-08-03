<template>
  <div class="form-item animate-slide-in-up">
    <label class="block text-sm font-medium text-vscode-foreground mb-3 transition-colors duration-200">
      {{ $t('sdk.toolchainSource.label') }}
    </label>
    <BaseSelect
      v-model="toolchainSource"
      :options="toolchainSourceOptions"
      class="w-full"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSelect from '@/components/common/BaseSelect.vue';

interface Props {
  modelValue?: 'sifli' | 'github';
  sdkSource?: 'github' | 'gitee';
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: 'sifli' | 'github'];
}>();

const { t } = useI18n();

// 工具链下载源
const toolchainSource = ref<'sifli' | 'github'>(props.modelValue || 'sifli');

// 工具链下载源选项
const toolchainSourceOptions = computed(() => [
  { value: 'sifli', label: t('sdk.toolchainSource.sifli') },
  { value: 'github', label: t('sdk.toolchainSource.github') }
]);

// 根据 SDK 来源自动设置默认工具链下载源
watch(() => props.sdkSource, (newSource: string | undefined) => {
  if (newSource === 'github') {
    toolchainSource.value = 'github';
  } else if (newSource === 'gitee') {
    toolchainSource.value = 'sifli';
  }
}, { immediate: true });

// 监听工具链下载源变化
watch(toolchainSource, (newValue: 'sifli' | 'github') => {
  emit('update:modelValue', newValue);
}, { immediate: true });

// 监听 modelValue 变化
watch(() => props.modelValue, (newValue) => {
  if (newValue && newValue !== toolchainSource.value) {
    toolchainSource.value = newValue;
  }
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
