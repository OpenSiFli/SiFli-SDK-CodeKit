import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { i18n } from '@/i18n';
import { onMessage, postMessage } from '@/services/vscodeBridge';
import type { KconfigChange, KconfigNode, KconfigSnapshot } from '@/types';

type KconfigTaskLevel = 'info' | 'warn' | 'error';

export interface KconfigTaskLog {
  ts: string;
  level: KconfigTaskLevel;
  message: string;
}

function flattenNodes(nodes: KconfigNode[], depth = 0): Array<KconfigNode & { depth: number }> {
  const result: Array<KconfigNode & { depth: number }> = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    result.push(...flattenNodes(node.children, depth + 1));
  }
  return result;
}

export const useKconfigStore = defineStore('kconfig', () => {
  const snapshot = ref<KconfigSnapshot | null>(null);
  const loading = ref(false);
  const previewing = ref(false);
  const saving = ref(false);
  const error = ref('');
  const logs = ref<KconfigTaskLog[]>([]);
  const changes = ref<Record<string, string>>({});
  let initialized = false;

  const flatNodes = computed(() => (snapshot.value ? flattenNodes(snapshot.value.nodes) : []));
  const changedCount = computed(() => Object.keys(changes.value).length);
  const dirty = computed(() => changedCount.value > 0 || !!snapshot.value?.dirty);

  function initializeMessaging() {
    if (initialized) {
      return;
    }
    initialized = true;

    onMessage<{ snapshot: KconfigSnapshot }>('kconfigSnapshot', payload => {
      snapshot.value = payload.snapshot;
      loading.value = false;
      previewing.value = false;
      error.value = '';
    });

    onMessage<{ message: string }>('kconfigError', payload => {
      error.value = payload.message;
      loading.value = false;
      previewing.value = false;
      saving.value = false;
    });

    onMessage<{ taskId: string; title: string }>('kconfigTaskStarted', payload => {
      saving.value = true;
      logs.value = [
        {
          ts: new Date().toISOString(),
          level: 'info',
          message: payload.title,
        },
      ];
    });

    onMessage<{ level: KconfigTaskLevel; message: string }>('kconfigTaskLog', payload => {
      logs.value = [
        ...logs.value,
        {
          ts: new Date().toISOString(),
          level: payload.level,
          message: payload.message,
        },
      ];
    });

    onMessage<{ success: boolean; message?: string; snapshot?: KconfigSnapshot }>('kconfigTaskFinished', payload => {
      saving.value = false;
      if (payload.snapshot) {
        snapshot.value = payload.snapshot;
      }
      if (payload.success) {
        changes.value = {};
        error.value = '';
      } else {
        error.value = payload.message ?? i18n.global.t('menuconfig.errors.saveFailed');
      }
    });
  }

  function fetchSnapshot() {
    initializeMessaging();
    loading.value = true;
    error.value = '';
    postMessage({ command: 'getKconfigSnapshot' });
  }

  function setChange(symbol: string, value: string) {
    if (!symbol) {
      return;
    }
    changes.value = {
      ...changes.value,
      [symbol]: value,
    };
    previewChanges();
  }

  function previewChanges() {
    initializeMessaging();
    previewing.value = true;
    error.value = '';
    postMessage({
      command: 'previewKconfigChanges',
      changes: serializeChanges(),
    });
  }

  function saveChanges() {
    initializeMessaging();
    error.value = '';
    postMessage({
      command: 'saveKconfigChanges',
      changes: serializeChanges(),
    });
  }

  function discardChanges() {
    changes.value = {};
    fetchSnapshot();
  }

  function openTerminalMenuconfig() {
    initializeMessaging();
    postMessage({ command: 'openTerminalMenuconfig' });
  }

  function serializeChanges(): KconfigChange[] {
    return Object.entries(changes.value).map(([symbol, value]) => ({ symbol, value }));
  }

  return {
    snapshot,
    flatNodes,
    loading,
    previewing,
    saving,
    error,
    logs,
    changes,
    changedCount,
    dirty,
    initializeMessaging,
    fetchSnapshot,
    setChange,
    saveChanges,
    discardChanges,
    openTerminalMenuconfig,
  };
});
