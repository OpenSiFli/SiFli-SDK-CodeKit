import { computed, ref } from '@vue/runtime-core';
import { defineStore } from 'pinia';
import type { ManagedSdkDetail, ManagedSdkSummary, SdkSource, ToolchainSource } from '@/types';
import { onMessage, postMessage } from '@/services/vscodeBridge';

export const useSdkCatalogStore = defineStore('sdkCatalog', () => {
  const sdks = ref<ManagedSdkSummary[]>([]);
  const details = ref<Record<string, ManagedSdkDetail>>({});
  const currentSdkId = ref<string | null>(null);
  const listLoading = ref(false);
  const detailLoading = ref(false);
  const bannerMessage = ref('');
  const bannerLevel = ref<'info' | 'warn' | 'error'>('info');
  const defaultSdkSource = ref<SdkSource>('github');
  const defaultToolchainSource = ref<ToolchainSource>('github');

  let initialized = false;

  const currentSdk = computed(
    () => sdks.value.find((item: ManagedSdkSummary) => item.id === currentSdkId.value) ?? null
  );

  function initializeMessaging() {
    if (initialized) {
      return;
    }

    initialized = true;

    onMessage<{ sdks: ManagedSdkSummary[]; currentSdkId: string | null }>('updateSdkList', payload => {
      sdks.value = payload.sdks ?? [];
      currentSdkId.value = payload.currentSdkId ?? null;
      listLoading.value = false;
    });

    onMessage<{ sdk: ManagedSdkDetail }>('sdkDetail', payload => {
      details.value = {
        ...details.value,
        [payload.sdk.id]: payload.sdk,
      };
      detailLoading.value = false;
    });

    onMessage<{ sdkId: string }>('sdkActivated', payload => {
      currentSdkId.value = payload.sdkId;
    });

    onMessage<{ sdkSource?: SdkSource; toolchainSource?: ToolchainSource }>('setDefaultSources', payload => {
      if (payload.sdkSource) {
        defaultSdkSource.value = payload.sdkSource;
      }
      if (payload.toolchainSource) {
        defaultToolchainSource.value = payload.toolchainSource;
      }
    });

    onMessage<{ message: string }>('error', payload => {
      setBanner(payload.message, 'error');
      listLoading.value = false;
      detailLoading.value = false;
    });
  }

  function fetchList() {
    initializeMessaging();
    listLoading.value = true;
    postMessage({ command: 'getSdkList' });
  }

  function fetchDetail(sdkId: string) {
    initializeMessaging();
    detailLoading.value = true;
    postMessage({ command: 'getSdkDetail', sdkId });
  }

  function activateSdk(sdkId: string) {
    postMessage({ command: 'activateSdk', sdkId });
  }

  function setBanner(message: string, level: typeof bannerLevel.value = 'info') {
    bannerMessage.value = message;
    bannerLevel.value = level;
  }

  function clearBanner() {
    bannerMessage.value = '';
  }

  function getSdkDetailById(sdkId: string) {
    return details.value[sdkId] ?? null;
  }

  return {
    sdks,
    currentSdkId,
    currentSdk,
    listLoading,
    detailLoading,
    bannerMessage,
    bannerLevel,
    defaultSdkSource,
    defaultToolchainSource,
    initializeMessaging,
    fetchList,
    fetchDetail,
    activateSdk,
    setBanner,
    clearBanner,
    getSdkDetailById,
  };
});
