<template>
  <section
    class="flex h-[calc(100vh-56px)] min-h-[520px] flex-col overflow-hidden border border-vscode-panel-border bg-vscode-background"
  >
    <header
      class="flex flex-wrap items-center gap-2 border-b border-vscode-panel-border bg-vscode-input-background/40 px-3 py-2"
    >
      <div class="flex min-w-[120px] items-center gap-2 text-sm">
        <span class="h-2 w-2 rounded-full" :class="status.connected ? 'bg-emerald-400' : 'bg-red-400'"></span>
        <strong>{{
          status.connected ? t('serialMonitor.status.connected') : t('serialMonitor.status.disconnected')
        }}</strong>
      </div>

      <select
        v-model="selectedPort"
        class="h-8 min-w-[240px] max-w-[420px] flex-1 rounded border border-vscode-input-border bg-vscode-input-background px-2 text-sm text-vscode-input-foreground"
        :disabled="ports.length === 0"
        @change="changePort"
      >
        <option v-if="ports.length === 0" value="">{{ t('serialMonitor.noPorts') }}</option>
        <option v-for="port in ports" :key="port.path" :value="port.path">
          {{ formatPortLabel(port) }}
        </option>
      </select>

      <button class="tool-button" @click="refreshPorts">{{ t('serialMonitor.actions.refresh') }}</button>

      <select v-model="mode" class="tool-select">
        <option value="text">{{ t('serialMonitor.mode.text') }}</option>
        <option value="hex">{{ t('serialMonitor.mode.hex') }}</option>
      </select>

      <select v-model="lineEnding" class="tool-select" :disabled="mode === 'hex'">
        <option value="none">{{ t('serialMonitor.lineEnding.none') }}</option>
        <option value="lf">{{ t('serialMonitor.lineEnding.lf') }}</option>
        <option value="crlf">{{ t('serialMonitor.lineEnding.crlf') }}</option>
      </select>

      <button class="tool-button" :class="showHex ? 'tool-button-active' : ''" @click="showHex = !showHex">
        {{ t('serialMonitor.actions.hexView') }}
      </button>
      <button
        class="tool-button"
        :class="settingsOpen ? 'tool-button-active' : ''"
        @click="settingsOpen = !settingsOpen"
      >
        {{ t('serialMonitor.actions.settings') }}
      </button>
      <button class="tool-button" @click="clearLog">{{ t('serialMonitor.actions.clear') }}</button>
      <button class="tool-button" :disabled="!status.connected" @click="resetDevice">
        {{ t('serialMonitor.actions.reset') }}
      </button>
      <button class="tool-button" :disabled="!canToggleConnection" @click="toggleConnection">
        {{ status.connected ? t('serialMonitor.actions.disconnect') : t('serialMonitor.actions.connect') }}
      </button>

      <div class="basis-full text-xs text-vscode-input-placeholder sm:basis-auto">
        <span v-if="activeBaudRate">{{ activeBaudRate }} baud</span>
        <span class="mx-2">·</span>
        <span>{{ t('serialMonitor.entries', { count: displayEntries.length }) }}</span>
      </div>
    </header>

    <div v-if="errorMessage" class="border-b border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
      {{ errorMessage }}
    </div>

    <main v-if="settingsOpen" class="min-h-0 flex-1 overflow-auto bg-vscode-background px-4 py-4 text-sm">
      <section class="max-w-2xl border border-vscode-panel-border bg-vscode-input-background/30 px-4 py-4">
        <p class="text-sm font-semibold">{{ t('serialMonitor.settings.title') }}</p>
        <p class="mt-1 text-xs text-vscode-input-placeholder">{{ t('serialMonitor.settings.description') }}</p>

        <label
          class="mt-4 flex cursor-pointer items-center justify-between gap-4 border-t border-vscode-panel-border pt-4"
        >
          <span>
            <span class="block text-sm">{{ t('serialMonitor.settings.showTimestamp') }}</span>
            <span class="mt-1 block text-xs text-vscode-input-placeholder">
              {{ t('serialMonitor.settings.showTimestampDescription') }}
            </span>
          </span>
          <input v-model="settings.showTimestamp" type="checkbox" class="h-4 w-4" @change="updateSettings" />
        </label>

        <label class="mt-4 block border-t border-vscode-panel-border pt-4">
          <span class="block text-sm">{{ t('serialMonitor.settings.logBaudRate') }}</span>
          <span class="mt-1 block text-xs text-vscode-input-placeholder">
            {{ t('serialMonitor.settings.logBaudRateDescription') }}
          </span>
          <select
            v-model.number="settings.logBaudRate"
            class="mt-3 h-8 min-w-[180px] rounded border border-vscode-input-border bg-vscode-input-background px-2 text-sm text-vscode-input-foreground"
            @change="updateSettings"
          >
            <option v-for="baudRate in baudRateOptions" :key="baudRate" :value="baudRate">
              {{ baudRate }}
            </option>
          </select>
        </label>
      </section>
    </main>

    <main
      v-else
      ref="logContainer"
      class="min-h-0 flex-1 overflow-auto bg-vscode-background px-3 py-2 font-mono text-sm leading-relaxed"
    >
      <div
        v-for="entry in displayEntries"
        :key="entry.id"
        class="grid gap-2 border-b border-vscode-panel-border/50 px-1 py-1.5"
        :class="settings.showTimestamp ? 'grid-cols-[74px_34px_minmax(0,1fr)]' : 'grid-cols-[34px_minmax(0,1fr)]'"
      >
        <span v-if="settings.showTimestamp" class="text-xs text-vscode-input-placeholder">
          {{ formatTime(entry.timestamp) }}
        </span>
        <span class="direction-chip" :class="directionClass(entry.source)">{{ directionLabel(entry.source) }}</span>
        <span class="min-w-0 whitespace-pre-wrap break-words">
          <span>{{ entry.text }}</span>
          <span v-if="showHex" class="mt-0.5 block text-xs text-vscode-input-placeholder">{{ entry.hex }}</span>
        </span>
      </div>
    </main>

    <footer
      v-if="!settingsOpen"
      class="grid grid-cols-[minmax(0,1fr)_96px] items-stretch gap-2 border-t border-vscode-panel-border bg-vscode-input-background/35 p-3"
    >
      <textarea
        v-model="input"
        class="send-input h-14 min-h-14 resize-none rounded border border-vscode-input-border bg-vscode-input-background px-3 py-2 font-mono text-sm leading-5 text-vscode-input-foreground"
        spellcheck="false"
        :placeholder="mode === 'hex' ? t('serialMonitor.placeholder.hex') : t('serialMonitor.placeholder.text')"
        @keydown="handleInputKeydown"
      ></textarea>
      <button class="tool-button-primary send-button" :disabled="!status.connected" @click="sendData">
        {{ t('serialMonitor.actions.send') }}
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { onMessage, postMessage } from '@/services/vscodeBridge';
import type {
  SerialLineEnding,
  SerialLogEntry,
  SerialLogSource,
  SerialMonitorSnapshot,
  SerialMonitorStatus,
  SerialPortInfo,
  SerialSendMode,
} from '@/types';

const { t } = useI18n();

const status = ref<SerialMonitorStatus>({ connected: false, logCount: 0 });
const entries = ref<SerialLogEntry[]>([]);
const ports = ref<SerialPortInfo[]>([]);
const selectedPort = ref('');
const mode = ref<SerialSendMode>('text');
const lineEnding = ref<SerialLineEnding>('crlf');
const showHex = ref(false);
const settingsOpen = ref(false);
const settings = ref({ showTimestamp: true, logBaudRate: 1000000 });
const input = ref('');
const errorMessage = ref('');
const logContainer = ref<HTMLElement | null>(null);
const supportedBaudRates = [1000000, 115200, 1500000, 2000000, 3000000, 6000000];

const selectedPortInStatus = computed(() => status.value.port || '');
const activeBaudRate = computed(() => status.value.baudRate || settings.value.logBaudRate);
const displayEntries = computed(() => entries.value.filter(entry => entry.source !== 'system'));
const canToggleConnection = computed(() => status.value.connected || !!selectedPort.value);
const baudRateOptions = computed(() => {
  const current = settings.value.logBaudRate;
  return supportedBaudRates.includes(current) ? supportedBaudRates : [current, ...supportedBaudRates];
});

const disposables: Array<() => void> = [];

onMounted(() => {
  disposables.push(
    onMessage<{ snapshot: SerialMonitorSnapshot }>('serialMonitorSnapshot', payload => {
      applySnapshot(payload.snapshot);
    }),
    onMessage<{ entry: SerialLogEntry }>('serialMonitorEntry', payload => {
      entries.value = [...entries.value, payload.entry].slice(-2000);
      status.value = { ...status.value, logCount: entries.value.length };
      void scrollToBottom();
    }),
    onMessage<{ status: SerialMonitorStatus }>('serialMonitorStatus', payload => {
      applyStatus(payload.status);
    }),
    onMessage<{ message: string }>('serialMonitorError', payload => {
      showError(payload.message);
    })
  );

  postMessage({ command: 'getSerialMonitorSnapshot' });
});

onUnmounted(() => {
  disposables.forEach(dispose => dispose());
});

function applySnapshot(snapshot: SerialMonitorSnapshot) {
  status.value = snapshot.status;
  entries.value = snapshot.entries || [];
  ports.value = snapshot.ports || [];
  selectedPort.value = snapshot.status.port || ports.value[0]?.path || '';
  lineEnding.value = snapshot.defaultLineEnding || 'crlf';
  settings.value = {
    showTimestamp: snapshot.settings?.showTimestamp ?? true,
    logBaudRate: snapshot.settings?.logBaudRate ?? snapshot.status.baudRate ?? 1000000,
  };
  void scrollToBottom();
}

function applyStatus(nextStatus: SerialMonitorStatus) {
  status.value = nextStatus;
  if (nextStatus.port) {
    selectedPort.value = nextStatus.port;
  }
}

function sendData() {
  postMessage({
    command: 'serialMonitorSend',
    payload: input.value,
    mode: mode.value,
    lineEnding: lineEnding.value,
  });
  input.value = '';
}

function changePort() {
  if (!selectedPort.value || selectedPort.value === selectedPortInStatus.value) {
    return;
  }
  postMessage({ command: 'serialMonitorChangePort', port: selectedPort.value });
}

function refreshPorts() {
  postMessage({ command: 'serialMonitorRefreshPorts' });
}

function resetDevice() {
  postMessage({ command: 'serialMonitorReset' });
}

function toggleConnection() {
  if (status.value.connected) {
    postMessage({ command: 'serialMonitorDisconnect' });
    return;
  }

  postMessage({
    command: 'serialMonitorConnect',
    port: selectedPort.value,
    baudRate: settings.value.logBaudRate,
  });
}

function clearLog() {
  postMessage({ command: 'serialMonitorClear' });
}

function updateSettings() {
  postMessage({
    command: 'serialMonitorUpdateSettings',
    settings: {
      showTimestamp: settings.value.showTimestamp,
      logBaudRate: settings.value.logBaudRate,
    },
  });
}

function handleInputKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    sendData();
  }
}

function formatPortLabel(port: SerialPortInfo): string {
  return port.manufacturer ? `${port.path} - ${port.manufacturer}` : port.path;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString();
}

function directionLabel(source: SerialLogSource): string {
  if (source === 'device') {
    return t('serialMonitor.direction.rx');
  }
  if (source === 'user' || source === 'mcp') {
    return t('serialMonitor.direction.tx');
  }
  return t('serialMonitor.direction.error');
}

function directionClass(source: SerialLogSource): string {
  switch (source) {
    case 'device':
      return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200';
    case 'user':
    case 'mcp':
      return 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200';
    case 'error':
      return 'border-red-500/35 bg-red-500/10 text-red-200';
    default:
      return 'border-vscode-panel-border text-vscode-input-placeholder';
  }
}

function showError(message: string) {
  errorMessage.value = message;
  window.setTimeout(() => {
    if (errorMessage.value === message) {
      errorMessage.value = '';
    }
  }, 6000);
}

async function scrollToBottom() {
  await nextTick();
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight;
  }
}
</script>

<style scoped>
.tool-button,
.tool-button-primary,
.tool-select {
  height: 32px;
  border-radius: 4px;
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  padding: 0 10px;
  font-size: 13px;
}

.tool-button,
.tool-select {
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
}

.tool-button-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.tool-button:disabled,
.tool-button-primary:disabled {
  cursor: default;
  opacity: 0.55;
}

.tool-button-active {
  border-color: var(--vscode-focus-border);
  color: var(--vscode-foreground);
}

.send-input {
  overflow-y: auto;
}

.send-button {
  height: 56px;
  min-width: 96px;
  align-self: stretch;
}

.direction-chip {
  display: inline-flex;
  height: 20px;
  width: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  border-width: 1px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}
</style>
