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
      <div v-if="state.logCount === 0" class="empty-log">{{ state.emptyLogLabel }}</div>
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

interface BuildTaskLogLink {
  start: number;
  end: number;
  path: string;
  line: number;
  column?: number;
}

interface BuildTaskViewLogEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  ts: string;
  level: BuildTaskLogLevel;
  message: string;
  links?: BuildTaskLogLink[];
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
  logs?: BuildTaskViewLogEntry[];
  logCount: number;
  activeCount: number;
  summaryLabel: string;
  emptyLogLabel: string;
}

interface BuildTasksUpdateMessage {
  command: 'buildTasks.update';
  state: BuildTaskLogViewState;
}

interface BuildTasksAppendLogsMessage {
  command: 'buildTasks.appendLogs';
  logs: BuildTaskViewLogEntry[];
  logCount: number;
}

type BuildTasksMessage = BuildTasksUpdateMessage | BuildTasksAppendLogsMessage;

const emptyState: BuildTaskLogViewState = {
  tasks: [],
  logCount: 0,
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
  const message = event.data as BuildTasksMessage;
  if (message?.command === 'buildTasks.update') {
    state.value = message.state;
    if (message.state.logs) {
      syncTerminalLogs(message.state.logs);
    }
    return;
  }

  if (message?.command === 'buildTasks.appendLogs') {
    state.value = {
      ...state.value,
      logCount: message.logCount,
    };
    appendTerminalLogs(message.logs);
  }
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
    linkHandler: {
      allowNonHttpProtocols: true,
      activate: (event, uri) => {
        if (!isOpenModifierPressed(event)) {
          return;
        }
        openLinkedLogLocation(uri);
      },
    },
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
  syncTerminalLogs(state.value.logs ?? []);
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

function appendTerminalLogs(logs: BuildTaskViewLogEntry[]) {
  if (!terminal || logs.length === 0) {
    return;
  }

  logs.forEach(entry => {
    writeLogEntry(entry);
    renderedLogIds.push(entry.id);
  });
  if (renderedLogIds.length > 10000) {
    renderedLogIds.splice(0, renderedLogIds.length - 10000);
  }
  terminal.scrollToBottom();
  fitTerminal();
}

function writeLogEntry(entry: BuildTaskViewLogEntry) {
  if (!terminal) {
    return;
  }

  const text = formatLogEntryText(entry);
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

function formatLogEntryText(entry: BuildTaskViewLogEntry): string {
  const links = (entry.links ?? [])
    .filter(link => isValidLogLink(link, entry.message.length))
    .sort((left, right) => left.start - right.start);
  if (links.length === 0) {
    return normalizeTerminalNewlines(entry.message);
  }

  let cursor = 0;
  let output = '';
  for (const link of links) {
    if (link.start < cursor) {
      continue;
    }
    output += entry.message.slice(cursor, link.start);
    output += wrapOscLink(entry.message.slice(link.start, link.end), link);
    cursor = link.end;
  }
  output += entry.message.slice(cursor);
  return normalizeTerminalNewlines(output);
}

function wrapOscLink(text: string, link: BuildTaskLogLink): string {
  return `\x1b]8;;${encodeLogLocationUri(link)}\x1b\\${text}\x1b]8;;\x1b\\`;
}

function encodeLogLocationUri(link: BuildTaskLogLink): string {
  const params = new URLSearchParams({
    path: link.path,
    line: String(link.line),
  });
  if (link.column !== undefined) {
    params.set('column', String(link.column));
  }
  return `sifli-log://open?${params.toString()}`;
}

function openLinkedLogLocation(uri: string) {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return;
  }
  if (parsed.protocol !== 'sifli-log:' || parsed.hostname !== 'open') {
    return;
  }

  const filePath = parsed.searchParams.get('path');
  const line = parsePositiveInteger(parsed.searchParams.get('line'));
  const column = parsePositiveInteger(parsed.searchParams.get('column'));
  if (!filePath || line === undefined) {
    return;
  }

  getVSCodeApiInstance()?.postMessage({
    command: 'buildTasks.openLocation',
    path: filePath,
    line,
    ...(column === undefined ? {} : { column }),
  });
}

function isOpenModifierPressed(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

function isValidLogLink(link: BuildTaskLogLink, messageLength: number): boolean {
  return (
    Number.isSafeInteger(link.start) &&
    Number.isSafeInteger(link.end) &&
    link.start >= 0 &&
    link.end > link.start &&
    link.end <= messageLength &&
    typeof link.path === 'string' &&
    link.path.length > 0 &&
    Number.isSafeInteger(link.line) &&
    link.line > 0 &&
    (link.column === undefined || (Number.isSafeInteger(link.column) && link.column > 0))
  );
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeTerminalNewlines(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
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
