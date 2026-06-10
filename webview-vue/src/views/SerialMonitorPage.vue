<template>
  <section
    class="serial-monitor-shell flex min-h-0 flex-col overflow-hidden border border-vscode-panel-border bg-vscode-background"
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

      <select v-model="mode" class="tool-select" :disabled="terminalMode">
        <option value="text">{{ t('serialMonitor.mode.text') }}</option>
        <option value="hex">{{ t('serialMonitor.mode.hex') }}</option>
      </select>

      <select v-model="lineEnding" class="tool-select" :disabled="mode === 'hex'">
        <option value="none">{{ t('serialMonitor.lineEnding.none') }}</option>
        <option value="lf">{{ t('serialMonitor.lineEnding.lf') }}</option>
        <option value="crlf">{{ t('serialMonitor.lineEnding.crlf') }}</option>
      </select>

      <button
        class="tool-button"
        :class="showHex && !continuousLog ? 'tool-button-active' : ''"
        :disabled="continuousLog"
        @click="showHex = !showHex"
      >
        {{ t('serialMonitor.actions.hexView') }}
      </button>
      <button
        class="tool-button"
        :class="terminalMode ? 'tool-button-active' : ''"
        @click="terminalMode = !terminalMode"
      >
        {{ t('serialMonitor.actions.terminalMode') }}
      </button>
      <button
        class="tool-button"
        :class="settingsOpen ? 'tool-button-active' : ''"
        @click="settingsOpen = !settingsOpen"
      >
        {{ t('serialMonitor.actions.settings') }}
      </button>
      <button class="tool-button" :class="searchOpen ? 'tool-button-active' : ''" @click="toggleSearch">
        {{ t('serialMonitor.actions.search') }}
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

    <div v-if="searchOpen && !settingsOpen" class="search-widget">
      <input
        ref="searchInput"
        v-model="searchQuery"
        class="search-input"
        spellcheck="false"
        :placeholder="t('serialMonitor.search.placeholder')"
        @keydown="handleSearchInputKeydown"
      />
      <span class="search-count">{{ searchResultText }}</span>
      <button
        class="search-button"
        :disabled="!canNavigateSearch"
        :title="t('serialMonitor.search.previous')"
        @click="goToSearchMatch('previous')"
      >
        &lt;
      </button>
      <button
        class="search-button"
        :disabled="!canNavigateSearch"
        :title="t('serialMonitor.search.next')"
        @click="goToSearchMatch('next')"
      >
        &gt;
      </button>
      <button
        class="search-button"
        :class="searchCaseSensitive ? 'tool-button-active' : ''"
        :title="t('serialMonitor.search.caseSensitive')"
        @click="searchCaseSensitive = !searchCaseSensitive"
      >
        Aa
      </button>
      <button
        class="search-button"
        :class="searchRegex ? 'tool-button-active' : ''"
        :title="t('serialMonitor.search.regex')"
        @click="searchRegex = !searchRegex"
      >
        .*
      </button>
      <button
        class="search-button search-button-wide"
        :class="searchHex ? 'tool-button-active' : ''"
        :disabled="!canSearchHex"
        :title="t('serialMonitor.search.hex')"
        @click="searchHex = !searchHex"
      >
        HEX
      </button>
      <button class="search-button" :title="t('serialMonitor.search.close')" @click="closeSearch">x</button>
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

        <label
          class="mt-4 flex cursor-pointer items-center justify-between gap-4 border-t border-vscode-panel-border pt-4"
        >
          <span>
            <span class="block text-sm">{{ t('serialMonitor.settings.renderAnsi') }}</span>
            <span class="mt-1 block text-xs text-vscode-input-placeholder">
              {{ t('serialMonitor.settings.renderAnsiDescription') }}
            </span>
          </span>
          <input v-model="settings.renderAnsi" type="checkbox" class="h-4 w-4" @change="updateSettings" />
        </label>

        <label
          class="mt-4 flex cursor-pointer items-center justify-between gap-4 border-t border-vscode-panel-border pt-4"
        >
          <span>
            <span class="block text-sm">{{ t('serialMonitor.settings.localEcho') }}</span>
            <span class="mt-1 block text-xs text-vscode-input-placeholder">
              {{ t('serialMonitor.settings.localEchoDescription') }}
            </span>
          </span>
          <input v-model="settings.localEcho" type="checkbox" class="h-4 w-4" @change="updateSettings" />
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
      class="min-h-0 flex-1 bg-vscode-background font-mono text-sm leading-relaxed"
      :class="terminalMode ? 'terminal-log-mode overflow-hidden' : 'overflow-auto px-3 py-2'"
    >
      <div v-if="terminalMode" ref="terminalContainer" class="xterm-host"></div>

      <div v-else-if="continuousLog" class="terminal-stream">
        <span v-for="rendered in searchModel.entries" :key="rendered.entry.id">
          <span
            v-for="(segment, segmentIndex) in rendered.textSegments"
            :key="segmentIndex"
            :class="segmentClass(segment)"
            :style="segment.style"
            v-bind="searchMatchData(segment)"
          >
            {{ segment.text }}
          </span>
        </span>
      </div>

      <div
        v-else
        v-for="rendered in searchModel.entries"
        :key="rendered.entry.id"
        class="grid gap-2 border-b border-vscode-panel-border/50 px-1 py-1.5"
        :class="settings.showTimestamp ? 'grid-cols-[74px_34px_minmax(0,1fr)]' : 'grid-cols-[34px_minmax(0,1fr)]'"
      >
        <span v-if="settings.showTimestamp" class="text-xs text-vscode-input-placeholder">
          {{ formatTime(rendered.entry.timestamp) }}
        </span>
        <span class="direction-chip" :class="directionClass(rendered.entry.source)">
          {{ directionLabel(rendered.entry.source) }}
        </span>
        <span class="min-w-0 whitespace-pre-wrap break-words">
          <span
            v-for="(segment, segmentIndex) in rendered.textSegments"
            :key="segmentIndex"
            :class="segmentClass(segment)"
            :style="segment.style"
            v-bind="searchMatchData(segment)"
          >
            {{ segment.text }}
          </span>
          <span
            v-if="showHex || (searchHex && searchActive)"
            class="mt-0.5 block text-xs text-vscode-input-placeholder"
          >
            <span
              v-for="(segment, segmentIndex) in rendered.hexSegments"
              :key="segmentIndex"
              :class="segmentClass(segment)"
              v-bind="searchMatchData(segment)"
            >
              {{ segment.text }}
            </span>
          </span>
        </span>
      </div>
    </main>

    <footer
      v-if="!settingsOpen && !terminalMode"
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon, type ISearchOptions, type ISearchResultChangeEvent } from '@xterm/addon-search';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { onMessage, postMessage } from '@/services/vscodeBridge';
import {
  renderAnsiEntries,
  stripAnsiControlSequences,
  type AnsiRenderSegment,
  type RenderedAnsiEntry,
} from '@/utils/ansiTerminal';
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

type SearchDirection = 'next' | 'previous';
type SearchTarget = 'text' | 'hex';

interface SearchMatch {
  index: number;
  entryId: number;
  target: SearchTarget;
  start: number;
  end: number;
}

interface SearchSegment extends AnsiRenderSegment {
  matchIndex?: number;
  active?: boolean;
}

interface SearchEntry {
  entry: SerialLogEntry;
  textSegments: SearchSegment[];
  hexSegments: SearchSegment[];
}

interface SearchModel {
  entries: SearchEntry[];
  matches: SearchMatch[];
  truncated: boolean;
}

const status = ref<SerialMonitorStatus>({ connected: false, logCount: 0 });
const entries = ref<SerialLogEntry[]>([]);
const ports = ref<SerialPortInfo[]>([]);
const selectedPort = ref('');
const mode = ref<SerialSendMode>('text');
const lineEnding = ref<SerialLineEnding>('crlf');
const showHex = ref(false);
const terminalMode = ref(false);
const settingsOpen = ref(false);
const settings = ref({ showTimestamp: true, renderAnsi: true, localEcho: false, logBaudRate: 1000000 });
const input = ref('');
const errorMessage = ref('');
const logContainer = ref<HTMLElement | null>(null);
const terminalContainer = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const searchOpen = ref(false);
const searchQuery = ref('');
const searchCaseSensitive = ref(false);
const searchRegex = ref(false);
const searchHex = ref(false);
const activeSearchMatchIndex = ref(0);
const terminalSearchResult = ref<ISearchResultChangeEvent>({ resultIndex: -1, resultCount: 0 });
const supportedBaudRates = [1000000, 115200, 1500000, 2000000, 3000000, 6000000];
const maxSearchMatches = 5000;

let terminal: Terminal | undefined;
let terminalFitAddon: FitAddon | undefined;
let terminalSearchAddon: SearchAddon | undefined;
let terminalInputDisposable: { dispose(): void } | undefined;
let terminalSearchResultDisposable: { dispose(): void } | undefined;
let terminalResizeObserver: ResizeObserver | undefined;
let terminalWrittenEntryId = 0;
let terminalSearchRefreshHandle: number | undefined;

const selectedPortInStatus = computed(() => status.value.port || '');
const activeBaudRate = computed(() => status.value.baudRate || settings.value.logBaudRate);
const displayEntries = computed(() => entries.value.filter(entry => entry.source !== 'system'));
const renderedEntries = computed(() => renderAnsiEntries(displayEntries.value, settings.value.renderAnsi));
const continuousLog = computed(() => terminalMode.value || !settings.value.showTimestamp);
const searchTerm = computed(() => searchQuery.value);
const searchActive = computed(() => searchOpen.value && searchTerm.value.length > 0);
const searchModel = computed(() =>
  buildSearchModel(renderedEntries.value, {
    term: searchOpen.value ? searchTerm.value : '',
    caseSensitive: searchCaseSensitive.value,
    regex: searchRegex.value,
    target: searchHex.value ? 'hex' : 'text',
    activeIndex: activeSearchMatchIndex.value,
    continuous: continuousLog.value && !terminalMode.value,
  })
);
const searchMatchCount = computed(() =>
  terminalMode.value ? terminalSearchResult.value.resultCount : searchModel.value.matches.length
);
const canNavigateSearch = computed(() => searchActive.value && searchMatchCount.value > 0);
const canSearchHex = computed(() => !terminalMode.value && !continuousLog.value);
const searchResultText = computed(() => {
  if (!searchActive.value) {
    return t('serialMonitor.search.idle');
  }
  if (searchMatchCount.value === 0) {
    return t('serialMonitor.search.noResults');
  }
  if (terminalMode.value) {
    return `${Math.max(terminalSearchResult.value.resultIndex + 1, 1)}/${searchMatchCount.value}`;
  }
  return `${activeSearchMatchIndex.value + 1}/${searchMatchCount.value}${searchModel.value.truncated ? '+' : ''}`;
});
const canToggleConnection = computed(() => status.value.connected || !!selectedPort.value);
const baudRateOptions = computed(() => {
  const current = settings.value.logBaudRate;
  return supportedBaudRates.includes(current) ? supportedBaudRates : [current, ...supportedBaudRates];
});

const disposables: Array<() => void> = [];

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('resize', handleWindowResize);
  disposables.push(() => window.removeEventListener('keydown', handleGlobalKeydown));
  disposables.push(() => window.removeEventListener('resize', handleWindowResize));
  disposables.push(
    onMessage<{ snapshot: SerialMonitorSnapshot }>('serialMonitorSnapshot', payload => {
      applySnapshot(payload.snapshot);
    }),
    onMessage<{ entry: SerialLogEntry }>('serialMonitorEntry', payload => {
      entries.value = [...entries.value, payload.entry].slice(-2000);
      status.value = { ...status.value, logCount: entries.value.length };
      syncTerminalEntries();
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
  disposeTerminal();
});

watch(terminalMode, enabled => {
  if (enabled) {
    mode.value = 'text';
    if (!settingsOpen.value) {
      void initializeTerminal();
    }
  } else {
    disposeTerminal();
  }
});

watch(settingsOpen, open => {
  if (!terminalMode.value) {
    return;
  }
  if (open) {
    disposeTerminal();
    return;
  }
  void initializeTerminal();
});

watch(
  () => settings.value.renderAnsi,
  () => {
    if (terminalMode.value) {
      replayTerminalEntries();
    }
  }
);

watch(
  () => searchModel.value.matches.length,
  count => {
    if (count === 0) {
      activeSearchMatchIndex.value = 0;
      return;
    }
    if (activeSearchMatchIndex.value >= count) {
      activeSearchMatchIndex.value = count - 1;
    }
  }
);

watch([searchTerm, searchCaseSensitive, searchRegex, searchHex], () => {
  activeSearchMatchIndex.value = 0;
});

watch(
  [activeSearchMatchIndex, searchMatchCount, searchOpen],
  () => {
    if (!terminalMode.value && searchActive.value) {
      void scrollToActiveSearchMatch();
    }
  },
  { flush: 'post' }
);

watch(terminalMode, enabled => {
  if (enabled) {
    searchHex.value = false;
    if (searchOpen.value && searchActive.value) {
      void nextTick(() => runTerminalSearch('next', true));
    }
  }
});

watch(canSearchHex, enabled => {
  if (!enabled) {
    searchHex.value = false;
  }
});

watch(
  [searchTerm, searchCaseSensitive, searchRegex, searchOpen],
  () => {
    if (terminalMode.value && searchOpen.value) {
      void nextTick(() => runTerminalSearch('next', true));
    }
  },
  { flush: 'post' }
);

function applySnapshot(snapshot: SerialMonitorSnapshot) {
  status.value = snapshot.status;
  entries.value = snapshot.entries || [];
  ports.value = snapshot.ports || [];
  selectedPort.value = snapshot.status.port || ports.value[0]?.path || '';
  lineEnding.value = snapshot.defaultLineEnding || 'crlf';
  settings.value = {
    showTimestamp: snapshot.settings?.showTimestamp ?? true,
    renderAnsi: snapshot.settings?.renderAnsi ?? true,
    localEcho: snapshot.settings?.localEcho ?? false,
    logBaudRate: snapshot.settings?.logBaudRate ?? snapshot.status.baudRate ?? 1000000,
  };
  if (terminalMode.value) {
    replayTerminalEntries();
  }
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
  if (terminalMode.value) {
    terminal?.clear();
    terminalWrittenEntryId = 0;
    clearTerminalSearch();
  }
  postMessage({ command: 'serialMonitorClear' });
}

function updateSettings() {
  postMessage({
    command: 'serialMonitorUpdateSettings',
    settings: {
      showTimestamp: settings.value.showTimestamp,
      renderAnsi: settings.value.renderAnsi,
      localEcho: settings.value.localEcho,
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

function handleGlobalKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    openSearch();
    return;
  }

  if (searchOpen.value && event.key === 'Escape') {
    event.preventDefault();
    closeSearch();
  }
}

function handleSearchInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    goToSearchMatch(event.shiftKey ? 'previous' : 'next');
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeSearch();
  }
}

function toggleSearch() {
  if (searchOpen.value) {
    closeSearch();
    return;
  }
  openSearch();
}

function openSearch() {
  settingsOpen.value = false;
  searchOpen.value = true;
  void nextTick(() => {
    searchInput.value?.focus();
    searchInput.value?.select();
  });
}

function closeSearch() {
  searchOpen.value = false;
  clearTerminalSearch();
}

function goToSearchMatch(direction: SearchDirection) {
  if (!searchActive.value) {
    openSearch();
    return;
  }

  if (terminalMode.value) {
    runTerminalSearch(direction);
    searchInput.value?.focus();
    return;
  }

  const count = searchMatchCount.value;
  if (count === 0) {
    return;
  }

  const delta = direction === 'next' ? 1 : -1;
  activeSearchMatchIndex.value = (activeSearchMatchIndex.value + delta + count) % count;
}

async function scrollToActiveSearchMatch() {
  await nextTick();
  const activeElement = logContainer.value?.querySelector<HTMLElement>(
    `[data-search-match-index="${activeSearchMatchIndex.value}"]`
  );
  activeElement?.scrollIntoView({ block: 'center', inline: 'nearest' });
}

async function initializeTerminal() {
  if (!terminalMode.value) {
    return;
  }
  await nextTick();
  if (!terminalContainer.value) {
    return;
  }

  if (!terminal) {
    terminal = new Terminal({
      allowProposedApi: true,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      scrollback: 5000,
      theme: readTerminalTheme(),
    });
    terminalFitAddon = new FitAddon();
    terminalSearchAddon = new SearchAddon({ highlightLimit: maxSearchMatches });
    terminal.loadAddon(terminalFitAddon);
    terminal.loadAddon(terminalSearchAddon);
    terminal.open(terminalContainer.value);
    terminalSearchResultDisposable = terminalSearchAddon.onDidChangeResults(result => {
      terminalSearchResult.value = result;
    });
    terminalInputDisposable = terminal.onData(data => {
      if (status.value.connected) {
        sendTerminalText(data);
      }
    });
    terminalResizeObserver = new ResizeObserver(() => fitTerminal());
    terminalResizeObserver.observe(terminalContainer.value);
    if (logContainer.value) {
      terminalResizeObserver.observe(logContainer.value);
    }
  }

  fitTerminal();
  replayTerminalEntries();
  scheduleTerminalSearchRefresh();
  terminal.focus();
}

function sendTerminalText(payload: string) {
  if (settings.value.localEcho && terminal) {
    terminal.write(toLocalEchoText(payload));
  }
  postMessage({
    command: 'serialMonitorSend',
    payload,
    mode: 'text',
    lineEnding: 'none',
  });
}

function toLocalEchoText(payload: string): string {
  return payload.replace(/\x7f/g, '\b \b').replace(/\r\n|\r|\n/g, '\r\n');
}

function runTerminalSearch(direction: SearchDirection, incremental = false) {
  if (!terminalSearchAddon) {
    return;
  }

  if (!searchTerm.value) {
    clearTerminalSearch();
    return;
  }

  try {
    const options = readTerminalSearchOptions(incremental);
    if (direction === 'previous') {
      terminalSearchAddon.findPrevious(searchTerm.value, options);
    } else {
      terminalSearchAddon.findNext(searchTerm.value, options);
    }
  } catch {
    clearTerminalSearch();
  }
}

function scheduleTerminalSearchRefresh() {
  if (!terminalMode.value || !searchOpen.value || !searchActive.value) {
    return;
  }
  if (terminalSearchRefreshHandle !== undefined) {
    window.clearTimeout(terminalSearchRefreshHandle);
  }
  terminalSearchRefreshHandle = window.setTimeout(() => {
    terminalSearchRefreshHandle = undefined;
    runTerminalSearch('next', true);
  }, 0);
}

function clearTerminalSearch() {
  if (terminalSearchRefreshHandle !== undefined) {
    window.clearTimeout(terminalSearchRefreshHandle);
    terminalSearchRefreshHandle = undefined;
  }
  terminalSearchAddon?.clearDecorations();
  terminal?.clearSelection();
  terminalSearchResult.value = { resultIndex: -1, resultCount: 0 };
}

function readTerminalSearchOptions(incremental: boolean): ISearchOptions {
  return {
    caseSensitive: searchCaseSensitive.value,
    regex: searchRegex.value,
    incremental,
    decorations: {
      matchBackground: '#5a4a1f',
      matchBorder: '#8a6f24',
      matchOverviewRuler: '#c8a84a',
      activeMatchBackground: '#d7ba7d',
      activeMatchBorder: '#ffffff',
      activeMatchColorOverviewRuler: '#d7ba7d',
    },
  };
}

function replayTerminalEntries() {
  if (!terminal) {
    return;
  }
  terminal.reset();
  terminalWrittenEntryId = 0;
  syncTerminalEntries();
  scheduleTerminalSearchRefresh();
}

function syncTerminalEntries() {
  if (!terminalMode.value || !terminal) {
    return;
  }

  displayEntries.value.forEach(entry => {
    if (entry.id <= terminalWrittenEntryId) {
      return;
    }
    terminalWrittenEntryId = entry.id;
    writeTerminalEntry(entry);
  });
  if (searchOpen.value && searchActive.value) {
    return;
  }
  terminal.scrollToBottom();
}

function writeTerminalEntry(entry: SerialLogEntry) {
  if (!terminal || entry.source === 'user' || entry.source === 'mcp') {
    return;
  }

  const text = settings.value.renderAnsi ? entry.text : stripAnsiControlSequences(entry.text);
  if (entry.source === 'error' && settings.value.renderAnsi) {
    terminal.write(`\x1b[31m${text}\x1b[0m\r\n`);
    return;
  }
  terminal.write(text);
}

function fitTerminal() {
  try {
    terminalFitAddon?.fit();
  } catch {
    // xterm can throw while the container is not measurable during webview layout churn.
  }
}

function handleWindowResize() {
  if (!terminalMode.value || !terminal) {
    return;
  }
  window.requestAnimationFrame(() => fitTerminal());
}

function disposeTerminal() {
  if (terminalSearchRefreshHandle !== undefined) {
    window.clearTimeout(terminalSearchRefreshHandle);
    terminalSearchRefreshHandle = undefined;
  }
  terminalResizeObserver?.disconnect();
  terminalResizeObserver = undefined;
  terminalInputDisposable?.dispose();
  terminalInputDisposable = undefined;
  terminalSearchResultDisposable?.dispose();
  terminalSearchResultDisposable = undefined;
  terminal?.dispose();
  terminal = undefined;
  terminalFitAddon = undefined;
  terminalSearchAddon = undefined;
  terminalSearchResult.value = { resultIndex: -1, resultCount: 0 };
  terminalWrittenEntryId = 0;
}

function readTerminalTheme() {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;

  return {
    background: read('--vscode-terminal-background', read('--vscode-editor-background', '#1e1e1e')),
    foreground: read('--vscode-terminal-foreground', read('--vscode-editor-foreground', '#d4d4d4')),
    cursor: read('--vscode-terminalCursor-foreground', read('--vscode-editor-foreground', '#d4d4d4')),
    selectionBackground: read('--vscode-terminal-selectionBackground', 'rgba(255, 255, 255, 0.25)'),
  };
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

function segmentClass(segment: SearchSegment): Array<string | undefined> {
  return [
    segment.className,
    segment.matchIndex !== undefined ? 'search-match' : undefined,
    segment.active ? 'search-match-active' : undefined,
  ];
}

function searchMatchData(segment: SearchSegment): Record<string, string> {
  return segment.matchIndex === undefined ? {} : { 'data-search-match-index': String(segment.matchIndex) };
}

function buildSearchModel(
  rendered: Array<RenderedAnsiEntry<SerialLogEntry>>,
  options: {
    term: string;
    caseSensitive: boolean;
    regex: boolean;
    target: SearchTarget;
    activeIndex: number;
    continuous: boolean;
  }
): SearchModel {
  if (options.continuous && options.target === 'text') {
    return buildContinuousSearchModel(rendered, options);
  }

  const entries: SearchEntry[] = [];
  const matches: SearchMatch[] = [];
  let nextMatchIndex = 0;
  let truncated = false;

  for (const item of rendered) {
    const remaining = maxSearchMatches - matches.length;
    if (remaining <= 0) {
      truncated = true;
    }
    const text = item.segments.map(segment => segment.text).join('');
    const textRanges =
      options.target === 'text' && remaining > 0
        ? readLimitedRanges(text, options, remaining)
        : { ranges: [], truncated: false };
    const textMatches =
      options.target === 'text'
        ? textRanges.ranges.map(range => ({
            ...range,
            entryId: item.entry.id,
            target: 'text' as const,
            index: nextMatchIndex++,
          }))
        : [];
    truncated = truncated || textRanges.truncated;

    const nextRemaining = maxSearchMatches - matches.length - textMatches.length;
    const hexRanges =
      options.target === 'hex' && nextRemaining > 0
        ? readLimitedRanges(item.entry.hex, options, nextRemaining)
        : { ranges: [], truncated: false };
    const hexMatches =
      options.target === 'hex'
        ? hexRanges.ranges.map(range => ({
            ...range,
            entryId: item.entry.id,
            target: 'hex' as const,
            index: nextMatchIndex++,
          }))
        : [];
    truncated = truncated || hexRanges.truncated;

    matches.push(...textMatches, ...hexMatches);
    entries.push({
      entry: item.entry,
      textSegments: decorateSearchSegments(item.segments, textMatches, options.activeIndex),
      hexSegments: decorateSearchSegments(
        [{ text: item.entry.hex, className: '', style: {} }],
        hexMatches,
        options.activeIndex
      ),
    });
  }

  return { entries, matches, truncated };
}

function buildContinuousSearchModel(
  rendered: Array<RenderedAnsiEntry<SerialLogEntry>>,
  options: {
    term: string;
    caseSensitive: boolean;
    regex: boolean;
    activeIndex: number;
  }
): SearchModel {
  const entryTexts = rendered.map(item => item.segments.map(segment => segment.text).join(''));
  const streamText = entryTexts.join('');
  const limitedRanges = readLimitedRanges(streamText, options, maxSearchMatches);
  const matches: SearchMatch[] = limitedRanges.ranges.map((range, index) => ({
    ...range,
    index,
    entryId: -1,
    target: 'text',
  }));
  const entries: SearchEntry[] = [];
  let entryOffset = 0;

  rendered.forEach((item, entryIndex) => {
    const entryText = entryTexts[entryIndex];
    const entryStart = entryOffset;
    const entryEnd = entryStart + entryText.length;
    const entryMatches = matches
      .filter(match => match.end > entryStart && match.start < entryEnd)
      .map(match => ({
        ...match,
        entryId: item.entry.id,
        start: Math.max(match.start, entryStart) - entryStart,
        end: Math.min(match.end, entryEnd) - entryStart,
      }));

    entries.push({
      entry: item.entry,
      textSegments: decorateSearchSegments(item.segments, entryMatches, options.activeIndex),
      hexSegments: [{ text: item.entry.hex, className: '', style: {} }],
    });
    entryOffset = entryEnd;
  });

  return { entries, matches, truncated: limitedRanges.truncated };
}

function readLimitedRanges(
  text: string,
  options: { term: string; caseSensitive: boolean; regex: boolean },
  limit: number
): { ranges: Array<{ start: number; end: number }>; truncated: boolean } {
  if (limit <= 0) {
    return { ranges: [], truncated: true };
  }

  const ranges = findSearchRanges(text, options, limit + 1);
  return {
    ranges: ranges.slice(0, limit),
    truncated: ranges.length > limit,
  };
}

function findSearchRanges(
  text: string,
  options: { term: string; caseSensitive: boolean; regex: boolean },
  limit: number
): Array<{ start: number; end: number }> {
  if (!options.term || !text || limit <= 0) {
    return [];
  }

  if (options.regex) {
    return findRegexRanges(text, options.term, options.caseSensitive, limit);
  }

  const ranges: Array<{ start: number; end: number }> = [];
  const haystack = options.caseSensitive ? text : text.toLocaleLowerCase();
  const needle = options.caseSensitive ? options.term : options.term.toLocaleLowerCase();
  let index = haystack.indexOf(needle);
  while (index !== -1 && ranges.length < limit) {
    ranges.push({ start: index, end: index + needle.length });
    index = haystack.indexOf(needle, index + Math.max(needle.length, 1));
  }
  return ranges;
}

function findRegexRanges(
  text: string,
  pattern: string,
  caseSensitive: boolean,
  limit: number
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let matcher: RegExp;
  try {
    matcher = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  } catch {
    return ranges;
  }

  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text)) && ranges.length < limit) {
    const matchText = match[0];
    if (!matchText) {
      matcher.lastIndex += 1;
      continue;
    }
    ranges.push({ start: match.index, end: match.index + matchText.length });
  }
  return ranges;
}

function decorateSearchSegments(
  segments: AnsiRenderSegment[],
  matches: SearchMatch[],
  activeIndex: number
): SearchSegment[] {
  if (matches.length === 0) {
    return segments;
  }

  const decorated: SearchSegment[] = [];
  let offset = 0;
  for (const segment of segments) {
    const segmentStart = offset;
    const segmentEnd = offset + segment.text.length;
    let cursor = 0;

    const overlappingMatches = matches.filter(match => match.end > segmentStart && match.start < segmentEnd);
    for (const match of overlappingMatches) {
      const start = Math.max(match.start, segmentStart) - segmentStart;
      const end = Math.min(match.end, segmentEnd) - segmentStart;
      if (start > cursor) {
        decorated.push({ ...segment, text: segment.text.slice(cursor, start) });
      }
      decorated.push({
        ...segment,
        text: segment.text.slice(start, end),
        matchIndex: match.index,
        active: match.index === activeIndex,
      });
      cursor = end;
    }

    if (cursor < segment.text.length) {
      decorated.push({ ...segment, text: segment.text.slice(cursor) });
    }
    offset = segmentEnd;
  }
  return decorated;
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
  if (searchActive.value) {
    return;
  }
  if (terminalMode.value && terminal) {
    terminal.scrollToBottom();
    return;
  }
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight;
  }
}
</script>

<style scoped>
.serial-monitor-shell {
  height: 100%;
  max-height: 100%;
  min-width: 0;
}

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

.terminal-source-tx {
  color: #67e8f9;
}

.terminal-source-error {
  color: #fca5a5;
}

.terminal-source-system {
  color: var(--vscode-input-placeholder);
}

.search-widget {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-input-background);
  padding: 6px 8px;
}

.search-input {
  height: 28px;
  min-width: 160px;
  flex: 1;
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  background: var(--vscode-editor-background);
  color: var(--vscode-input-foreground);
  outline: none;
  padding: 0 8px;
  font-size: 13px;
}

.search-input:focus {
  border-color: var(--vscode-focus-border);
}

.search-count {
  min-width: 52px;
  text-align: center;
  color: var(--vscode-input-placeholder);
  font-size: 12px;
  white-space: nowrap;
}

.search-button {
  height: 28px;
  min-width: 28px;
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  padding: 0 8px;
  font-size: 12px;
}

.search-button-wide {
  min-width: 42px;
}

.search-button:disabled {
  cursor: default;
  opacity: 0.45;
}

.search-match {
  border-radius: 2px;
  background: color-mix(in srgb, var(--vscode-editor-findMatchHighlightBackground, #f6b94d) 65%, transparent);
  color: var(--vscode-editor-foreground);
}

.search-match-active {
  background: var(--vscode-editor-findMatchBackground, #f6b94d);
  color: var(--vscode-editor-foreground);
  outline: 1px solid var(--vscode-focus-border);
}

.terminal-stream {
  min-height: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.terminal-log-mode {
  padding: 0;
  background: var(--vscode-terminal-background, var(--vscode-background));
  color: var(--vscode-terminal-foreground, var(--vscode-foreground));
  outline: none;
  min-width: 0;
}

.xterm-host {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.xterm-host :deep(.xterm) {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 8px 10px;
}

.xterm-host :deep(.xterm-screen) {
  width: 100%;
  min-height: 100%;
}

.xterm-host :deep(.xterm-viewport) {
  background: transparent;
}

.xterm-host :deep(.xterm-helpers),
.xterm-host :deep(.xterm-helper-textarea) {
  max-width: 100%;
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
