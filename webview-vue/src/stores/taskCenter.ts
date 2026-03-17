import { computed, ref } from '@vue/runtime-core';
import { defineStore } from 'pinia';
import type { SdkTaskRecord, TaskLogEntry, TaskSnapshotMessage, TaskStartedMessage, WebviewMessage } from '@/types';
import { onMessage, postMessage } from '@/services/vscodeBridge';

export const useTaskCenterStore = defineStore('taskCenter', () => {
  const tasks = ref<Record<string, SdkTaskRecord>>({});
  const requestInFlight = ref(false);
  let initialized = false;

  const sortedTasks = computed(() =>
    Object.values(tasks.value).sort((left: SdkTaskRecord, right: SdkTaskRecord) =>
      right.startedAt.localeCompare(left.startedAt)
    )
  );

  function initializeMessaging() {
    if (initialized) {
      return;
    }

    initialized = true;

    onMessage<TaskStartedMessage>('taskStarted', payload => {
      tasks.value = {
        ...tasks.value,
        [payload.task.id]: payload.task,
      };
      requestInFlight.value = false;
    });

    onMessage<TaskSnapshotMessage>('taskSnapshot', payload => {
      tasks.value = {
        ...tasks.value,
        [payload.task.id]: payload.task,
      };
    });

    onMessage<{ taskId: string; entry: TaskLogEntry }>('taskLog', payload => {
      const existingTask = tasks.value[payload.taskId];
      if (!existingTask) {
        return;
      }

      tasks.value = {
        ...tasks.value,
        [payload.taskId]: {
          ...existingTask,
          logs: [...existingTask.logs, payload.entry],
        },
      };
    });

    onMessage<{ task: SdkTaskRecord }>('taskFinished', payload => {
      tasks.value = {
        ...tasks.value,
        [payload.task.id]: payload.task,
      };
      requestInFlight.value = false;
    });

    onMessage<{ message: string }>('error', () => {
      requestInFlight.value = false;
    });
  }

  function fetchTask(taskId: string) {
    initializeMessaging();
    postMessage({
      command: 'getTaskStatus',
      taskId,
    });
  }

  async function requestTask(message: WebviewMessage) {
    initializeMessaging();
    requestInFlight.value = true;

    return new Promise<string>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        dispose();
        requestInFlight.value = false;
        reject(new Error('等待任务启动超时。'));
      }, 4000);

      const dispose = onMessage<TaskStartedMessage>('taskStarted', payload => {
        window.clearTimeout(timeout);
        dispose();
        tasks.value = {
          ...tasks.value,
          [payload.task.id]: payload.task,
        };
        resolve(payload.taskId);
      });

      postMessage(message);
    });
  }

  function getTask(taskId: string) {
    return tasks.value[taskId] ?? null;
  }

  return {
    tasks,
    sortedTasks,
    requestInFlight,
    initializeMessaging,
    fetchTask,
    requestTask,
    getTask,
  };
});
