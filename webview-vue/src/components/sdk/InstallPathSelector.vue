<template>
  <div class="form-control w-full">
    <label class="label">
      <span class="label-text text-vscode-foreground">安装路径</span>
    </label>
    <div class="join w-full">
      <BaseInput
        v-model="installPath"
        placeholder="选择 SDK 安装目录"
        readonly
        class="join-item flex-1"
        @update:modelValue="$emit('update:modelValue', $event)"
      />
      <BaseButton
        variant="secondary"
        class="join-item"
        @click="$emit('browse')"
      >
        浏览
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import BaseInput from '@/components/common/BaseInput.vue';
import BaseButton from '@/components/common/BaseButton.vue';

interface Props {
  modelValue: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  browse: [];
}>();

const installPath = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
});
</script>
