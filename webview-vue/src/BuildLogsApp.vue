<template>
  <main class="build-logs-app">
    <header class="taskbar">
      <section class="task-summary" aria-label="Build task summary">
        <span class="summary-count">{{ state.summaryLabel }}</span>
        <span v-if="primaryTask" class="summary-divider" aria-hidden="true"></span>
        <span v-if="primaryTask" class="summary-task" :class="primaryTask.status" :title="primaryTask.tooltip">
          <span class="summary-task-title">{{ primaryTask.title }}</span>
          <span class="summary-task-status">{{ primaryTask.description || primaryTask.statusLabel }}</span>
        </span>
      </section>

      <section v-if="state.tasks.length > 0" class="status-counts" aria-label="Build task status counts">
        <span v-for="item in statusCounts" :key="item.status" class="status-count" :class="item.status">
          <span class="status-dot" aria-hidden="true"></span>
          <span>{{ item.label }}</span>
          <strong>{{ item.count }}</strong>
        </span>
      </section>
    </header>

    <section class="terminal-section">
      <div ref="terminalContainer" class="terminal-host" aria-label="SiFli build logs"></div>
      <div v-if="state.logs.length === 0" class="empty-log">{{ state.emptyLogLabel }}</div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import type { IDisposable } from '@xterm/xterm';
import { getVSCodeApiInstance } from './utils/vsCodeApi';

type BuildTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';
type BuildTaskLogLevel = 'info' | 'warn' | 'error';

interface BuildTaskViewLogEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  ts: string;
  level: BuildTaskLogLevel;
  message: string;
}

interface BuildTaskViewModel {
  id: string;
  title: string;
  status: BuildTaskStatus;
  statusLabel: string;
  description: string;
  tooltip: string;
}

interface BuildTaskLogViewState {
  tasks: BuildTaskViewModel[];
  logs: BuildTaskViewLogEntry[];
  activeCount: number;
  summaryLabel: string;
  emptyLogLabel: string;
}

interface BuildTasksUpdateMessage {
  command: 'buildTasks.update';
  state: BuildTaskLogViewState;
}

const emptyState: BuildTaskLogViewState = {
  tasks: [],
  logs: [],
  activeCount: 0,
  summaryLabel: '',
  emptyLogLabel: '',
};

const terminalContainer = ref<HTMLElement | null>(null);
const state = ref<BuildTaskLogViewState>(emptyState);
const primaryTask = computed(() => {
  return (
    state.value.tasks.find(task => task.status === 'running') ??
    state.value.tasks.find(task => task.status === 'queued') ??
    state.value.tasks[0]
  );
});
const statusCounts = computed(() => {
  const fallbackLabels: Record<BuildTaskStatus, string> = {
    queued: 'Queued',
    running: 'Running',
    succeeded: 'Succeeded',
    failed: 'Failed',
  };
  const counts: Record<BuildTaskStatus, number> = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
  };
  state.value.tasks.forEach(task => {
    counts[task.status] += 1;
  });

  const order: BuildTaskStatus[] = ['running', 'queued', 'failed', 'succeeded'];
  return order
    .map(status => ({
      status,
      count: counts[status],
      label: state.value.tasks.find(task => task.status === status)?.statusLabel ?? fallbackLabels[status],
    }))
    .filter(item => item.count > 0);
});

let terminal: Terminal | undefined;
let fitAddon: FitAddon | undefined;
let resizeObserver: ResizeObserver | undefined;
let terminalDataDisposable: IDisposable | undefined;
let renderedLogIds: string[] = [];

onMounted(async () => {
  await initializeTerminal();
  window.addEventListener('message', handleMessage);
  getVSCodeApiInstance()?.postMessage({ command: 'buildTasks.ready' });
});

onBeforeUnmount(() => {
  window.removeEventListener('message', handleMessage);
  disposeTerminal();
});

function handleMessage(event: MessageEvent) {
  const message = event.data as BuildTasksUpdateMessage;
  if (message?.command !== 'buildTasks.update') {
    return;
  }
  state.value = message.state;
  syncTerminalLogs(message.state.logs);
}

async function initializeTerminal() {
  await nextTick();
  if (!terminalContainer.value || terminal) {
    return;
  }

  terminal = new Terminal({
    convertEol: false,
    cursorBlink: false,
    disableStdin: true,
    fontFamily: readTerminalFontFamily(),
    fontSize: readTerminalFontSize(),
    scrollback: 10000,
    theme: readTerminalTheme(),
  });
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalContainer.value);
  terminalDataDisposable = terminal.onData(() => {
    // The build log terminal is intentionally read-only.
  });
  resizeObserver = new ResizeObserver(() => fitTerminal());
  resizeObserver.observe(terminalContainer.value);
  fitTerminal();
  syncTerminalLogs(state.value.logs);
}

function syncTerminalLogs(logs: BuildTaskViewLogEntry[]) {
  if (!terminal) {
    return;
  }

  const nextLogIds = logs.map(log => log.id);
  const canAppend =
    renderedLogIds.length <= nextLogIds.length && renderedLogIds.every((id, index) => id === nextLogIds[index]);

  if (!canAppend) {
    terminal.reset();
    renderedLogIds = [];
  }

  logs.slice(renderedLogIds.length).forEach(entry => {
    writeLogEntry(entry);
  });
  renderedLogIds = nextLogIds;
  terminal.scrollToBottom();
  fitTerminal();
}

function writeLogEntry(entry: BuildTaskViewLogEntry) {
  if (!terminal) {
    return;
  }

  const text = entry.message.replace(/\r?\n/g, '\r\n');
  if (entry.level === 'error') {
    terminal.write(`\x1b[31m${text}\x1b[0m\r\n`);
    return;
  }
  if (entry.level === 'warn') {
    terminal.write(`\x1b[33m${text}\x1b[0m\r\n`);
    return;
  }
  terminal.write(`${text}\r\n`);
}

function fitTerminal() {
  try {
    fitAddon?.fit();
  } catch {
    // xterm can throw while VS Code is resizing or hiding the panel.
  }
}

function disposeTerminal() {
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  terminalDataDisposable?.dispose();
  terminalDataDisposable = undefined;
  terminal?.dispose();
  terminal = undefined;
  fitAddon = undefined;
  renderedLogIds = [];
}

function readTerminalTheme() {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;

  return {
    background: read('--vscode-terminal-background', read('--vscode-editor-background', '#1e1e1e')),
    foreground: read('--vscode-terminal-foreground', read('--vscode-editor-foreground', '#d4d4d4')),
    cursor: 'rgba(0, 0, 0, 0)',
    cursorAccent: 'rgba(0, 0, 0, 0)',
    selectionBackground: read('--vscode-terminal-selectionBackground', 'rgba(255, 255, 255, 0.25)'),
  };
}

function readTerminalFontFamily(): string {
  const style = getComputedStyle(document.documentElement);
  return (
    style.getPropertyValue('--vscode-editor-font-family').trim() ||
    style.getPropertyValue('--vscode-font-family').trim() ||
    "Menlo, Monaco, 'Courier New', monospace"
  );
}

function readTerminalFontSize(): number {
  const style = getComputedStyle(document.documentElement);
  const value = Number.parseInt(style.getPropertyValue('--vscode-editor-font-size').trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : 13;
}
</script>
