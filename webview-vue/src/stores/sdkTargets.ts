import { computed, ref } from '@vue/runtime-core';
import { defineStore } from 'pinia';
import type { SdkTarget } from '@/types';
import { onMessage, postMessage } from '@/services/vscodeBridge';

export const useSdkTargetsStore = defineStore('sdkTargets', () => {
  const targets = ref<SdkTarget[]>([]);
  const loading = ref(false);
  let initialized = false;

  const branchTargets = computed(() => targets.value.filter((item: SdkTarget) => item.kind === 'branch'));
  const tagTargets = computed(() => targets.value.filter((item: SdkTarget) => item.kind === 'tag'));

  function initializeMessaging() {
    if (initialized) {
      return;
    }

    initialized = true;

    onMessage<{ targets: SdkTarget[] }>('sdkTargets', payload => {
      targets.value = payload.targets ?? [];
      loading.value = false;
    });

    onMessage<{ message: string }>('error', () => {
      loading.value = false;
    });
  }

  function fetchTargets() {
    initializeMessaging();
    loading.value = true;
    postMessage({ command: 'getSdkTargets' });
  }

  function findTarget(ref: string) {
    return targets.value.find((item: SdkTarget) => item.ref === ref) ?? null;
  }

  return {
    targets,
    loading,
    branchTargets,
    tagTargets,
    initializeMessaging,
    fetchTargets,
    findTarget,
  };
});
