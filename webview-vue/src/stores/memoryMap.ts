import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { onMessage, postMessage } from '@/services/vscodeBridge';
import type { MemoryMapSnapshot, MemorySymbolEntry } from '@/types';

export const useMemoryMapStore = defineStore('memoryMap', () => {
  const snapshot = ref<MemoryMapSnapshot | null>(null);
  const loading = ref(false);
  const refreshing = ref(false);
  const error = ref('');
  let initialized = false;

  const hasSnapshot = computed(() => !!snapshot.value);
  const regions = computed(() => snapshot.value?.regions ?? []);
  const sections = computed(() => snapshot.value?.sections ?? []);
  const symbols = computed(() => snapshot.value?.topSymbols ?? []);

  function initializeMessaging() {
    if (initialized) {
      return;
    }
    initialized = true;

    onMessage<{ snapshot: MemoryMapSnapshot }>('memoryMapSnapshot', payload => {
      snapshot.value = payload.snapshot;
      loading.value = false;
      refreshing.value = false;
      error.value = '';
    });

    onMessage<{ message: string }>('memoryMapError', payload => {
      error.value = payload.message;
      loading.value = false;
      refreshing.value = false;
    });
  }

  function fetchSnapshot() {
    initializeMessaging();
    loading.value = true;
    error.value = '';
    postMessage({ command: 'getMemoryMapSnapshot' });
  }

  function refreshAnalysis() {
    initializeMessaging();
    refreshing.value = true;
    error.value = '';
    postMessage({ command: 'refreshMemoryMapAnalysis' });
  }

  function openSymbol(symbol: MemorySymbolEntry) {
    postMessage({
      command: 'openMemoryMapLocation',
      mapPath: snapshot.value?.mapPath,
      line: symbol.line,
    });
  }

  function clearError() {
    error.value = '';
  }

  return {
    snapshot,
    loading,
    refreshing,
    error,
    hasSnapshot,
    regions,
    sections,
    symbols,
    initializeMessaging,
    fetchSnapshot,
    refreshAnalysis,
    openSymbol,
    clearError,
  };
});
