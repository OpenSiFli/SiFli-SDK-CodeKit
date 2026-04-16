import { computed, ref } from '@vue/runtime-core';
import { defineStore } from 'pinia';
import type {
  DebugSnapshotBootstrap,
  DebugSnapshotOutputRootSelection,
  DebugSnapshotPlan,
  DebugSnapshotRequest,
  DebugSnapshotTaskRecord,
} from '@/types';
import { onMessage, postMessage } from '@/services/vscodeBridge';

export const useDebugSnapshotStore = defineStore('debugSnapshot', () => {
  const bootstrap = ref<DebugSnapshotBootstrap | null>(null);
  const plan = ref<DebugSnapshotPlan | null>(null);
  const outputRoot = ref('');
  const selectedItemIds = ref(new Set<string>());
  const currentTask = ref<DebugSnapshotTaskRecord | null>(null);
  const loading = ref(false);
  const planLoading = ref(false);
  const error = ref<string | null>(null);

  let initialized = false;

  const canExport = computed(() => {
    return (
      !!bootstrap.value?.session.canExport &&
      !!plan.value &&
      selectedItemIds.value.size > 0 &&
      outputRoot.value.length > 0 &&
      !isTaskRunning.value
    );
  });

  const isTaskRunning = computed(() => currentTask.value?.status === 'running');

  const selectedItems = computed(() => {
    if (!plan.value) {
      return [];
    }
    return plan.value.items.filter(item => selectedItemIds.value.has(item.id));
  });

  function initializeMessaging() {
    if (initialized) {
      return;
    }
    initialized = true;

    onMessage<{ bootstrap: DebugSnapshotBootstrap }>('debugSnapshotBootstrap', payload => {
      bootstrap.value = payload.bootstrap;
      if (payload.bootstrap.lastOutputRoot) {
        outputRoot.value = payload.bootstrap.lastOutputRoot;
      }
      loading.value = false;
    });

    onMessage<{ plan: DebugSnapshotPlan }>('debugSnapshotPlan', payload => {
      plan.value = payload.plan;
      const ids = new Set<string>();
      for (const item of payload.plan.items) {
        if (item.selectedByDefault) {
          ids.add(item.id);
        }
      }
      selectedItemIds.value = ids;
      planLoading.value = false;
    });

    onMessage<{ selection: DebugSnapshotOutputRootSelection }>('debugSnapshotOutputRootSelected', payload => {
      if (!payload.selection.cancelled && payload.selection.outputRoot) {
        outputRoot.value = payload.selection.outputRoot;
      }
    });

    onMessage<{ task: DebugSnapshotTaskRecord }>('debugSnapshotTaskStarted', payload => {
      currentTask.value = payload.task;
    });

    onMessage<{ task: DebugSnapshotTaskRecord | undefined }>('debugSnapshotTaskSnapshot', payload => {
      if (payload.task) {
        currentTask.value = payload.task;
      }
    });

    onMessage<{ task: DebugSnapshotTaskRecord }>('debugSnapshotTaskUpdated', payload => {
      if (!currentTask.value || currentTask.value.taskId === payload.task.taskId) {
        currentTask.value = payload.task;
      }
    });

    onMessage<{ task: DebugSnapshotTaskRecord }>('debugSnapshotTaskFinished', payload => {
      if (!currentTask.value || currentTask.value.taskId === payload.task.taskId) {
        currentTask.value = payload.task;
      }
    });

    onMessage<{ message: string }>('debugSnapshotError', payload => {
      error.value = payload.message;
      loading.value = false;
      planLoading.value = false;
    });
  }

  function fetchBootstrap() {
    loading.value = true;
    error.value = null;
    postMessage({ command: 'getDebugSnapshotBootstrap' });
  }

  function buildPlan(partNumber: string) {
    planLoading.value = true;
    plan.value = null;
    selectedItemIds.value = new Set();
    error.value = null;
    postMessage({ command: 'buildDebugSnapshotPlan', partNumber });
  }

  function browseOutputRoot() {
    postMessage({ command: 'browseDebugSnapshotOutputRoot' });
  }

  function startExport() {
    if (!plan.value || !outputRoot.value) {
      return;
    }
    startExportWithItems([...selectedItemIds.value]);
  }

  function exportSingleItem(itemId: string) {
    startExportWithItems([itemId]);
  }

  function cancelExport() {
    if (currentTask.value) {
      postMessage({ command: 'cancelDebugSnapshotTask', taskId: currentTask.value.taskId });
    }
  }

  function toggleItem(id: string) {
    const next = new Set(selectedItemIds.value);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedItemIds.value = next;
  }

  function selectAll() {
    if (!plan.value) {
      return;
    }
    selectedItemIds.value = new Set(plan.value.items.map(item => item.id));
  }

  function deselectAll() {
    selectedItemIds.value = new Set();
  }

  function clearTask() {
    currentTask.value = null;
  }

  function clearError() {
    error.value = null;
  }

  function startExportWithItems(selectedIds: string[]) {
    if (!plan.value || !outputRoot.value || selectedIds.length === 0) {
      return;
    }

    error.value = null;
    const request: DebugSnapshotRequest = {
      partNumber: plan.value.chip.partNumber,
      outputRoot: outputRoot.value,
      selectedItemIds: selectedIds,
    };
    postMessage({ command: 'startDebugSnapshotExport', request });
  }

  return {
    bootstrap,
    plan,
    outputRoot,
    selectedItemIds,
    currentTask,
    loading,
    planLoading,
    error,
    canExport,
    isTaskRunning,
    selectedItems,
    initializeMessaging,
    fetchBootstrap,
    buildPlan,
    browseOutputRoot,
    startExport,
    exportSingleItem,
    cancelExport,
    toggleItem,
    selectAll,
    deselectAll,
    clearTask,
    clearError,
  };
});
