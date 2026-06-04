<template>
  <section class="space-y-5">
    <div class="rounded-2xl border border-vscode-panel-border bg-vscode-background px-5 py-5 shadow-sm">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
            {{ t('memoryMap.sectionLabel') }}
          </p>
          <h2 class="mt-2 text-2xl font-semibold tracking-tight">{{ t('memoryMap.title') }}</h2>
          <p class="mt-2 max-w-3xl text-sm text-vscode-input-placeholder">
            {{ t('memoryMap.subtitle') }}
          </p>
        </div>

        <div class="flex flex-wrap gap-3">
          <BaseButton variant="secondary" :loading="store.refreshing" @click="store.refreshAnalysis">
            {{ t('memoryMap.actions.refresh') }}
          </BaseButton>
        </div>
      </div>

      <div v-if="store.error" class="mt-5 rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm">
        <div class="flex items-start justify-between gap-3">
          <span>{{ store.error }}</span>
          <button class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder" @click="store.clearError">
            {{ t('common.close') }}
          </button>
        </div>
      </div>

      <div v-if="store.loading && !snapshot" class="mt-8 text-sm text-vscode-input-placeholder">
        {{ t('common.loading') }}
      </div>

      <div
        v-else-if="!snapshot"
        class="mt-8 rounded-lg border border-dashed border-vscode-panel-border px-5 py-8 text-center text-sm text-vscode-input-placeholder"
      >
        {{ t('memoryMap.empty') }}
      </div>

      <template v-else>
        <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-lg border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4">
            <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">
              {{ t('memoryMap.summary.runtime') }}
            </p>
            <p class="mt-2 text-2xl font-semibold">{{ formatBytes(snapshot.totalRuntimeBytes) }}</p>
          </div>
          <div class="rounded-lg border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4">
            <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">
              {{ t('memoryMap.summary.load') }}
            </p>
            <p class="mt-2 text-2xl font-semibold">{{ formatBytes(snapshot.totalLoadBytes) }}</p>
          </div>
          <div class="rounded-lg border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4">
            <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">
              {{ t('memoryMap.summary.regions') }}
            </p>
            <p class="mt-2 text-2xl font-semibold">{{ snapshot.regions.length }}</p>
          </div>
          <div class="rounded-lg border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4">
            <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">
              {{ t('memoryMap.summary.symbols') }}
            </p>
            <p class="mt-2 text-2xl font-semibold">{{ snapshot.topSymbols.length }}</p>
          </div>
        </div>

        <dl class="mt-5 grid gap-3 text-sm lg:grid-cols-2">
          <div>
            <dt class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">
              {{ t('memoryMap.labels.mapFile') }}
            </dt>
            <dd class="mt-1 break-all font-mono text-xs">{{ snapshot.mapPath }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">
              {{ t('memoryMap.labels.board') }}
            </dt>
            <dd class="mt-1">{{ snapshot.boardName || t('common.notAvailable') }}</dd>
          </div>
        </dl>
      </template>
    </div>

    <template v-if="snapshot">
      <div class="space-y-5">
        <section class="space-y-5">
          <div class="rounded-2xl border border-vscode-panel-border bg-vscode-background px-5 py-5 shadow-sm">
            <div class="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 class="text-lg font-semibold">{{ t('memoryMap.regions.title') }}</h3>
                <p class="mt-1 text-sm text-vscode-input-placeholder">
                  {{ t('memoryMap.regions.symbolShare') }}
                </p>
              </div>
            </div>

            <div class="mt-4 space-y-3">
              <div
                class="h-[460px] rounded-lg border border-vscode-panel-border bg-vscode-input-background/25 p-2 md:h-[560px]"
              >
                <VChart
                  class="h-full w-full"
                  :option="regionTreemapOption"
                  :init-options="chartInitOptions"
                  :autoresize="chartResizeOptions"
                />
              </div>

              <div class="grid gap-2 lg:grid-cols-2 2xl:grid-cols-4">
                <article
                  v-for="region in regionSummaries"
                  :key="region.name"
                  class="rounded-lg bg-vscode-input-background/25 px-3 py-3"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-semibold">{{ region.name }}</p>
                      <p class="font-mono text-xs text-vscode-input-placeholder">
                        {{ formatHex(region.origin) }} | {{ formatBytes(region.length) }}
                      </p>
                    </div>
                    <p class="text-right text-xs text-vscode-input-placeholder">
                      {{ region.attributes || t('common.notAvailable') }}
                    </p>
                  </div>
                  <div class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-vscode-input-placeholder">
                    <div>
                      {{ t('memoryMap.regions.runtime') }}
                      <p class="mt-1 font-semibold text-vscode-foreground">{{ formatBytes(region.runtimeUsed) }}</p>
                    </div>
                    <div>
                      {{ t('memoryMap.regions.usedLabel') }}
                      <p class="mt-1 font-semibold text-vscode-foreground">{{ formatPercent(region.usedPercent) }}</p>
                    </div>
                    <div>
                      {{ t('memoryMap.regions.load') }}
                      <p class="mt-1 font-semibold text-vscode-foreground">{{ formatBytes(region.loadUsed) }}</p>
                    </div>
                    <div>
                      {{ t('memoryMap.regions.free') }}
                      <p class="mt-1 font-semibold text-vscode-foreground">{{ formatBytes(region.freeBytes) }}</p>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-vscode-panel-border bg-vscode-background px-5 py-5 shadow-sm">
            <div class="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 class="text-lg font-semibold">{{ t('memoryMap.sections.title') }}</h3>
                <p class="mt-1 text-sm text-vscode-input-placeholder">
                  {{ t('memoryMap.sections.barSubtitle', { count: sectionChartItems.length }) }}
                </p>
              </div>
            </div>

            <div class="mt-4 rounded-lg border border-vscode-panel-border bg-vscode-input-background/25 p-2">
              <VChart
                class="w-full"
                :style="{ height: sectionChartHeight }"
                :option="sectionBarOption"
                :init-options="chartInitOptions"
                :autoresize="chartResizeOptions"
              />
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-vscode-panel-border bg-vscode-background px-5 py-5 shadow-sm">
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 class="text-lg font-semibold">{{ t('memoryMap.symbols.title') }}</h3>
                <p class="mt-1 text-sm text-vscode-input-placeholder">
                  {{
                    t('memoryMap.symbols.count', {
                      visible: filteredSymbols.length,
                      total: snapshot.topSymbols.length,
                    })
                  }}
                </p>
              </div>
              <button
                class="rounded-lg border border-vscode-panel-border px-3 py-2 text-sm transition-colors hover:bg-vscode-input-background"
                :disabled="!canResetFilters"
                @click="clearFilters"
              >
                {{ t('memoryMap.filters.reset') }}
              </button>
            </div>

            <div class="rounded-lg border border-vscode-panel-border bg-vscode-input-background/25 px-3 py-3">
              <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <button
                  class="inline-flex items-center gap-2 rounded-lg border border-vscode-button-background px-2.5 py-1.5 text-xs font-medium text-vscode-button-background transition-colors hover:bg-vscode-button-background hover:text-vscode-button-foreground"
                  @click="addFilter"
                >
                  <span class="text-base leading-none">+</span>
                  {{ t('memoryMap.filters.add') }}
                </button>

                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-xs uppercase tracking-[0.16em] text-vscode-input-placeholder">
                    {{ t('memoryMap.filters.sort') }}
                  </span>
                  <button
                    v-for="option in sortOptions"
                    :key="option.value"
                    class="filter-chip"
                    :class="chipClass(sortMode === option.value)"
                    @click="sortMode = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>

              <div
                v-if="symbolFilters.length === 0"
                class="mt-3 rounded-lg border border-dashed border-vscode-panel-border px-3 py-3 text-sm text-vscode-input-placeholder"
              >
                {{ t('memoryMap.filters.empty') }}
              </div>

              <div v-else class="mt-3 space-y-2">
                <div
                  v-for="filter in symbolFilters"
                  :key="filter.id"
                  class="grid gap-2 px-2 py-2 lg:grid-cols-[190px_170px_minmax(0,1fr)_34px]"
                >
                  <select v-model="filter.field" class="filter-control" @change="handleFilterFieldChange(filter)">
                    <option v-for="field in filterFields" :key="field.value" :value="field.value">
                      {{ field.label }}
                    </option>
                  </select>

                  <select v-model="filter.operator" class="filter-control" @change="normalizeFilterOperator(filter)">
                    <option
                      v-for="operator in operatorOptionsFor(filter.field)"
                      :key="operator.value"
                      :value="operator.value"
                    >
                      {{ operator.label }}
                    </option>
                  </select>

                  <div v-if="filter.field === 'size'" class="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                    <input
                      v-model="filter.value"
                      class="filter-control"
                      inputmode="decimal"
                      type="number"
                      min="0"
                      step="any"
                      :placeholder="t('memoryMap.filters.numberPlaceholder')"
                    />
                    <select v-model="filter.sizeUnit" class="filter-control">
                      <option v-for="unit in sizeUnitOptions" :key="unit.value" :value="unit.value">
                        {{ unit.label }}
                      </option>
                    </select>
                  </div>

                  <select
                    v-else-if="valueOptionsFor(filter.field).length > 0"
                    v-model="filter.value"
                    class="filter-control"
                  >
                    <option value="">{{ t('memoryMap.filters.chooseValue') }}</option>
                    <option v-for="option in valueOptionsFor(filter.field)" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>

                  <input
                    v-else
                    v-model="filter.value"
                    class="filter-control"
                    :placeholder="valuePlaceholderFor(filter.field)"
                  />

                  <button
                    class="rounded-lg border border-vscode-panel-border px-2 py-1 text-sm transition-colors hover:bg-vscode-input-background"
                    :aria-label="t('memoryMap.filters.remove')"
                    @click="removeFilter(filter.id)"
                  >
                    x
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-5 overflow-hidden rounded-lg border border-vscode-panel-border">
            <table class="w-full table-fixed border-collapse text-sm">
              <thead class="bg-vscode-input-background/70 text-left text-xs uppercase tracking-[0.14em]">
                <tr>
                  <th class="w-[32%] px-3 py-2">{{ t('memoryMap.symbols.columns.symbol') }}</th>
                  <th class="w-[16%] px-3 py-2">{{ t('memoryMap.symbols.columns.size') }}</th>
                  <th class="w-[18%] px-3 py-2">{{ t('memoryMap.symbols.columns.region') }}</th>
                  <th class="w-[34%] px-3 py-2">{{ t('memoryMap.symbols.columns.object') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="symbol in filteredSymbols"
                  :key="`${symbol.line}-${symbol.name}-${symbol.address}`"
                  class="border-t border-vscode-panel-border align-top hover:bg-vscode-input-background/45"
                >
                  <td class="px-3 py-2">
                    <button
                      class="max-w-full text-left font-mono text-sm hover:underline"
                      @click="store.openSymbol(symbol)"
                    >
                      <span class="block break-words">{{ symbol.name }}</span>
                      <span class="mt-1 block text-xs text-vscode-input-placeholder">
                        {{ symbol.outputSection }} | {{ formatHex(symbol.address) }}
                      </span>
                    </button>
                  </td>
                  <td class="px-3 py-2 font-semibold">{{ formatBytes(symbol.size) }}</td>
                  <td class="px-3 py-2">{{ symbol.regionName || t('common.notAvailable') }}</td>
                  <td class="px-3 py-2">
                    <span class="block break-words font-mono text-xs text-vscode-input-placeholder">
                      {{ shortenObjectPath(symbol.objectPath) }}
                    </span>
                    <span class="mt-1 block font-mono text-xs text-vscode-input-placeholder">{{ symbol.section }}</span>
                  </td>
                </tr>
                <tr v-if="filteredSymbols.length === 0">
                  <td colspan="4" class="px-3 py-8 text-center text-vscode-input-placeholder">
                    {{ t('memoryMap.symbols.empty') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { BarChart, TreemapChart, type BarSeriesOption, type TreemapSeriesOption } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  type GridComponentOption,
  type TooltipComponentOption,
} from 'echarts/components';
import { use, type ComposeOption } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import VChart from 'vue-echarts';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/common/BaseButton.vue';
import { useMemoryMapStore } from '@/stores/memoryMap';
import type { MemoryRegionUsage, MemorySectionUsage, MemorySymbolEntry } from '@/types';

use([BarChart, GridComponent, TreemapChart, TooltipComponent, SVGRenderer]);

type SortMode = 'size' | 'name' | 'address';
type SymbolFilterField = 'name' | 'region' | 'section' | 'object' | 'size' | 'address';
type SymbolFilterOperator =
  | 'contains'
  | 'equals'
  | 'notEquals'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'lessThan';
type SizeUnit = 'B' | 'KiB' | 'MiB';
type MemoryMapChartOption = ComposeOption<
  BarSeriesOption | GridComponentOption | TooltipComponentOption | TreemapSeriesOption
>;

interface FilterOption {
  name: string;
  count: number;
}

interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface SymbolFilter {
  id: string;
  field: SymbolFilterField;
  operator: SymbolFilterOperator;
  value: string;
  sizeUnit: SizeUnit;
}

interface RegionSummary extends MemoryRegionUsage {
  usedPercent: number;
  freeBytes: number;
}

interface MemoryTreemapNode {
  name: string;
  value: number;
  bytes: number;
  percent: number;
  kind: 'region' | 'section' | 'symbol' | 'other';
  regionName?: string;
  sectionName?: string;
  address?: number;
  loadAddress?: number;
  loadRegionName?: string;
  itemStyle: {
    color?: string;
    borderColor?: string;
    borderWidth?: number;
    gapWidth?: number;
  };
  children?: MemoryTreemapNode[];
}

interface SectionBarDatum {
  name: string;
  value: number;
  size: number;
  address: number;
  loadAddress?: number;
  regionName?: string;
  loadRegionName?: string;
  itemStyle: {
    color: string;
  };
}

interface ChartTheme {
  foreground: string;
  mutedForeground: string;
  gridLine: string;
  treemapBorder: string;
  treemapInnerBorder: string;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipForeground: string;
  segmentColors: string[];
  otherColor: string;
  romColor: string;
  ramColor: string;
  sectionFallbackColor: string;
}

const store = useMemoryMapStore();
const { t } = useI18n();
const symbolFilters = ref<SymbolFilter[]>([]);
const sortMode = ref<SortMode>('size');
let nextFilterId = 1;

const sectionChartLimit = 14;
const chartInitOptions = { renderer: 'svg' as const };
const chartResizeOptions = { throttle: 120 };
const chartTheme = ref(createChartTheme());
let themeObserver: MutationObserver | undefined;

const snapshot = computed(() => store.snapshot);

const filterFields = computed<Array<SelectOption<SymbolFilterField>>>(() => [
  { value: 'name', label: t('memoryMap.filters.fields.symbol') },
  { value: 'region', label: t('memoryMap.filters.fields.region') },
  { value: 'section', label: t('memoryMap.filters.fields.section') },
  { value: 'object', label: t('memoryMap.filters.fields.object') },
  { value: 'size', label: t('memoryMap.filters.fields.size') },
  { value: 'address', label: t('memoryMap.filters.fields.address') },
]);

const textOperators = computed<Array<SelectOption<SymbolFilterOperator>>>(() => [
  { value: 'contains', label: t('memoryMap.filters.operators.contains') },
  { value: 'equals', label: t('memoryMap.filters.operators.equals') },
  { value: 'notEquals', label: t('memoryMap.filters.operators.notEquals') },
  { value: 'startsWith', label: t('memoryMap.filters.operators.startsWith') },
  { value: 'endsWith', label: t('memoryMap.filters.operators.endsWith') },
]);

const numericOperators = computed<Array<SelectOption<SymbolFilterOperator>>>(() => [
  { value: 'greaterThan', label: t('memoryMap.filters.operators.greaterThan') },
  { value: 'lessThan', label: t('memoryMap.filters.operators.lessThan') },
  { value: 'equals', label: t('memoryMap.filters.operators.equals') },
  { value: 'notEquals', label: t('memoryMap.filters.operators.notEquals') },
]);

const sizeUnitOptions: Array<SelectOption<SizeUnit>> = [
  { value: 'B', label: 'B' },
  { value: 'KiB', label: 'KiB' },
  { value: 'MiB', label: 'MiB' },
];

const sortOptions = computed<Array<{ value: SortMode; label: string }>>(() => [
  { value: 'size', label: t('memoryMap.sort.size') },
  { value: 'name', label: t('memoryMap.sort.name') },
  { value: 'address', label: t('memoryMap.sort.address') },
]);

const regionFilters = computed<FilterOption[]>(() =>
  store.regions.map(region => ({
    name: region.name,
    count: store.symbols.filter(symbol => symbol.regionName === region.name).length,
  }))
);

const sectionFilters = computed<FilterOption[]>(() =>
  [...new Set(store.symbols.map(symbol => symbol.outputSection))]
    .sort((left, right) => left.localeCompare(right))
    .map(section => ({
      name: section,
      count: store.symbols.filter(symbol => symbol.outputSection === section).length,
    }))
);

const orderedSections = computed(() =>
  [...store.sections].sort((left, right) => {
    if (right.size !== left.size) {
      return right.size - left.size;
    }
    return left.name.localeCompare(right.name);
  })
);

const regionSummaries = computed<RegionSummary[]>(() =>
  store.regions.map(region => {
    const totalBytes = totalBytesForRegion(region);
    const freeBytes = Math.max(totalBytes - region.runtimeUsed, 0);

    return {
      ...region,
      usedPercent: percentage(region.runtimeUsed, totalBytes),
      freeBytes,
    };
  })
);

const regionTreemapOption = computed<MemoryMapChartOption>(() => buildRegionTreemapOption());

const sectionChartItems = computed(() => orderedSections.value.slice(0, sectionChartLimit));

const sectionChartHeight = computed(() => `${Math.max(240, sectionChartItems.value.length * 34 + 64)}px`);

const effectiveFilters = computed(() => symbolFilters.value.filter(isFilterComplete));

const canResetFilters = computed(() => symbolFilters.value.length > 0 || sortMode.value !== 'size');

const sectionBarOption = computed<MemoryMapChartOption>(() => buildSectionBarOption(sectionChartItems.value));

const filteredSymbols = computed(() => {
  const filters = effectiveFilters.value;
  const filtered = store.symbols.filter(symbol => {
    return filters.every(filter => matchesFilter(symbol, filter));
  });

  return filtered.sort((left, right) => {
    if (sortMode.value === 'name') {
      return left.name.localeCompare(right.name);
    }
    if (sortMode.value === 'address') {
      return left.address - right.address;
    }
    if (right.size !== left.size) {
      return right.size - left.size;
    }
    return left.name.localeCompare(right.name);
  });
});

onMounted(() => {
  updateChartTheme();
  observeThemeChanges();
  store.fetchSnapshot();
});

onUnmounted(() => {
  themeObserver?.disconnect();
  themeObserver = undefined;
});

function updateChartTheme() {
  chartTheme.value = createChartTheme();
}

function observeThemeChanges() {
  if (typeof MutationObserver === 'undefined') {
    return;
  }

  themeObserver?.disconnect();
  themeObserver = new MutationObserver(updateChartTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-vscode-theme-kind', 'style'],
  });
}

function createChartTheme(): ChartTheme {
  const background = readCssVariable('--vscode-editor-background', '#1f1f1f');
  const foreground = readCssVariable('--vscode-foreground', '#d4d4d4');
  const mutedForeground = readCssVariable(
    '--vscode-input-placeholder',
    isDarkTheme(background) ? '#9d9d9d' : '#667085'
  );
  const panelBorder = readCssVariable('--vscode-panel-border', isDarkTheme(background) ? '#343434' : '#d0d7de');
  const isDark = isDarkTheme(background);

  return {
    foreground,
    mutedForeground,
    gridLine: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.1)',
    treemapBorder: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.12)',
    treemapInnerBorder: isDark ? 'rgba(31, 31, 31, 0.96)' : 'rgba(255, 255, 255, 0.92)',
    tooltipBackground: readCssVariable('--vscode-editorWidget-background', isDark ? '#252526' : '#ffffff'),
    tooltipBorder: panelBorder,
    tooltipForeground: foreground,
    segmentColors: isDark
      ? ['#4f8cff', '#35c2a1', '#f7b955', '#ef6f6c', '#b88cff', '#6fc3df', '#a0c95a']
      : ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#65a30d'],
    otherColor: isDark ? '#8a8f98' : '#64748b',
    romColor: isDark ? '#4f8cff' : '#2563eb',
    ramColor: isDark ? '#35c2a1' : '#059669',
    sectionFallbackColor: isDark ? '#8a8f98' : '#64748b',
  };
}

function readCssVariable(name: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }

  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function isDarkTheme(background: string): boolean {
  const bodyThemeKind =
    typeof document === 'undefined' ? '' : (document.body.getAttribute('data-vscode-theme-kind') ?? '');

  if (bodyThemeKind.includes('dark')) {
    return true;
  }
  if (bodyThemeKind.includes('light')) {
    return false;
  }

  const rgb = parseColorToRgb(background);
  if (!rgb) {
    return true;
  }

  return colorBrightness(rgb) < 128;
}

function parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
  const trimmed = color.trim();

  if (trimmed.startsWith('#')) {
    return parseHexColor(trimmed);
  }

  const rgbMatch = trimmed.match(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/i);
  if (!rgbMatch) {
    return null;
  }

  return {
    r: Number(rgbMatch[1]),
    g: Number(rgbMatch[2]),
    b: Number(rgbMatch[3]),
  };
}

function parseHexColor(color: string): { r: number; g: number; b: number } | null {
  const hex = color.replace('#', '');
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map(char => `${char}${char}`)
          .join('')
      : hex.slice(0, 6);

  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function colorBrightness(color: { r: number; g: number; b: number }): number {
  return (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
}

function totalBytesForRegion(region: MemoryRegionUsage): number {
  return region.length > 0 ? region.length : Math.max(region.runtimeUsed, 1);
}

function buildRegionTreemapOption(): MemoryMapChartOption {
  const theme = chartTheme.value;
  const totalRegionBytes = store.regions.reduce((sum, region) => sum + totalBytesForRegion(region), 0);

  return {
    animation: false,
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: theme.tooltipBackground,
      borderColor: theme.tooltipBorder,
      textStyle: {
        color: theme.tooltipForeground,
      },
      formatter: formatTreemapTooltip,
    },
    series: [
      {
        type: 'treemap',
        roam: true,
        nodeClick: 'zoomToNode',
        leafDepth: 1,
        breadcrumb: {
          show: true,
          height: 22,
          bottom: 0,
          itemStyle: {
            color: theme.tooltipBackground,
            borderColor: theme.tooltipBorder,
            textStyle: {
              color: theme.foreground,
            },
          },
        },
        left: 0,
        top: 0,
        right: 0,
        bottom: 28,
        visibleMin: 48,
        childrenVisibleMin: 96,
        squareRatio: 1.25,
        label: {
          show: true,
          color: theme.foreground,
          fontSize: 11,
          lineHeight: 15,
          overflow: 'truncate',
          ellipsis: '...',
          formatter: formatTreemapLabel,
        },
        upperLabel: {
          show: true,
          height: 24,
          color: theme.foreground,
          fontSize: 12,
          fontWeight: 600,
        },
        itemStyle: {
          borderColor: theme.treemapBorder,
          borderWidth: 1,
          gapWidth: 2,
        },
        levels: [
          {
            itemStyle: {
              borderColor: theme.treemapBorder,
              borderWidth: 1,
              gapWidth: 4,
            },
          },
          {
            itemStyle: {
              borderColor: theme.treemapInnerBorder,
              borderWidth: 1,
              gapWidth: 1,
            },
          },
        ],
        data: store.regions.map(region => createRegionTreemapNode(region, totalRegionBytes)),
      },
    ],
  };
}

function createRegionTreemapNode(region: MemoryRegionUsage, totalRegionBytes: number): MemoryTreemapNode {
  const theme = chartTheme.value;
  const totalBytes = totalBytesForRegion(region);
  const sections = createSectionTreemapNodes(region);

  return {
    name: region.name,
    value: totalBytes,
    bytes: totalBytes,
    percent: percentage(totalBytes, totalRegionBytes),
    kind: 'region',
    regionName: region.name,
    itemStyle: {
      color: colorForRegion(region.name),
      borderColor: theme.treemapBorder,
      borderWidth: 1,
      gapWidth: 2,
    },
    children: sections.length > 0 ? sections : undefined,
  };
}

function createSectionTreemapNodes(region: MemoryRegionUsage): MemoryTreemapNode[] {
  const theme = chartTheme.value;

  return store.sections
    .filter(section => section.regionName === region.name && section.size > 0)
    .sort((left, right) => {
      if (right.size !== left.size) {
        return right.size - left.size;
      }
      return left.name.localeCompare(right.name);
    })
    .map((section, index) =>
      createSectionTreemapNode(region, section, theme.segmentColors[index % theme.segmentColors.length])
    );
}

function createSectionTreemapNode(
  region: MemoryRegionUsage,
  section: MemorySectionUsage,
  color: string
): MemoryTreemapNode {
  const symbols = createSymbolTreemapNodes(region, section);

  return {
    name: section.name,
    value: section.size,
    bytes: section.size,
    percent: percentage(section.size, Math.max(region.runtimeUsed, 1)),
    kind: 'section',
    regionName: region.name,
    sectionName: section.name,
    address: section.address,
    loadAddress: section.loadAddress,
    loadRegionName: section.loadRegionName,
    itemStyle: {
      color,
    },
    children: symbols.length > 0 ? symbols : undefined,
  };
}

function createSymbolTreemapNodes(region: MemoryRegionUsage, section: MemorySectionUsage): MemoryTreemapNode[] {
  const theme = chartTheme.value;
  const symbols = store.symbols
    .filter(symbol => symbol.regionName === region.name && symbol.outputSection === section.name && symbol.size > 0)
    .sort((left, right) => {
      if (right.size !== left.size) {
        return right.size - left.size;
      }
      return left.name.localeCompare(right.name);
    });
  const nodes = symbols.map((symbol, index) =>
    createSymbolTreemapNode(region, section, symbol, theme.segmentColors[index % theme.segmentColors.length])
  );
  const accountedBytes = symbols.reduce((sum, symbol) => sum + symbol.size, 0);
  const otherBytes = Math.max(section.size - accountedBytes, 0);

  if (otherBytes > 0) {
    nodes.push({
      name: t('memoryMap.regions.otherSymbols'),
      value: otherBytes,
      bytes: otherBytes,
      percent: percentage(otherBytes, section.size),
      kind: 'other',
      regionName: region.name,
      sectionName: section.name,
      itemStyle: {
        color: theme.otherColor,
      },
    });
  }

  return nodes;
}

function createSymbolTreemapNode(
  region: MemoryRegionUsage,
  section: MemorySectionUsage,
  symbol: MemorySymbolEntry,
  color: string
): MemoryTreemapNode {
  return {
    name: symbol.name,
    value: symbol.size,
    bytes: symbol.size,
    percent: percentage(symbol.size, section.size),
    kind: 'symbol',
    regionName: region.name,
    sectionName: section.name,
    address: symbol.address,
    itemStyle: {
      color,
    },
  };
}

function buildSectionBarOption(sections: MemorySectionUsage[]): MemoryMapChartOption {
  const theme = chartTheme.value;
  const data = sections.map(createSectionBarDatum);

  return {
    animation: false,
    grid: {
      left: 112,
      top: 10,
      right: 92,
      bottom: 28,
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: theme.tooltipBackground,
      borderColor: theme.tooltipBorder,
      textStyle: {
        color: theme.tooltipForeground,
      },
      formatter: formatSectionTooltip,
    },
    xAxis: {
      type: 'value',
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: theme.mutedForeground,
        fontSize: 11,
        formatter: formatAxisBytes,
      },
      splitLine: {
        lineStyle: {
          color: theme.gridLine,
        },
      },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: data.map(item => item.name),
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: theme.foreground,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        formatter: shortenAxisLabel,
      },
    },
    series: [
      {
        type: 'bar',
        data,
        barWidth: 14,
        label: {
          show: true,
          position: 'right',
          color: theme.foreground,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 11,
          formatter: formatSectionBarLabel,
        },
        itemStyle: {
          borderRadius: [0, 5, 5, 0],
        },
        emphasis: {
          disabled: true,
        },
      },
    ],
  };
}

function createSectionBarDatum(section: MemorySectionUsage): SectionBarDatum {
  return {
    name: section.name,
    value: section.size,
    size: section.size,
    address: section.address,
    loadAddress: section.loadAddress,
    regionName: section.regionName,
    loadRegionName: section.loadRegionName,
    itemStyle: {
      color: colorForRegion(section.regionName),
    },
  };
}

function colorForRegion(regionName: string | undefined): string {
  const theme = chartTheme.value;
  const normalized = regionName?.toLowerCase() ?? '';

  if (normalized.includes('rom') || normalized.includes('flash')) {
    return theme.romColor;
  }
  if (normalized.includes('ram')) {
    return theme.ramColor;
  }
  return theme.sectionFallbackColor;
}

function formatTreemapTooltip(params: unknown): string {
  const node = getTreemapNode(params);

  if (!node) {
    return '';
  }

  if (node.kind === 'region') {
    const region = store.regions.find(item => item.name === node.regionName);
    const totalBytes = region ? totalBytesForRegion(region) : node.bytes;
    const usedBytes = region?.runtimeUsed ?? 0;
    const freeBytes = Math.max(totalBytes - usedBytes, 0);

    return [
      escapeHtml(node.name),
      `${formatBytes(totalBytes)} | ${formatPercent(node.percent)}`,
      `${escapeHtml(t('memoryMap.regions.usedLabel'))}: ${formatBytes(usedBytes)} (${formatPercent(percentage(usedBytes, totalBytes))})`,
      `${escapeHtml(t('memoryMap.regions.free'))}: ${formatBytes(freeBytes)}`,
    ].join('<br/>');
  }

  if (node.kind === 'section') {
    const lines = [
      escapeHtml(`${node.regionName ?? ''} / ${node.name}`),
      `${formatBytes(node.bytes)} | ${formatPercent(node.percent)}`,
    ];

    if (node.address !== undefined) {
      lines.push(`VMA ${formatHex(node.address)}`);
    }
    if (node.loadAddress !== undefined) {
      lines.push(`LMA ${formatHex(node.loadAddress)}`);
    }
    if (node.loadRegionName && node.loadRegionName !== node.regionName) {
      lines.push(escapeHtml(t('memoryMap.sections.loadRegion', { region: node.loadRegionName })));
    }

    return lines.join('<br/>');
  }

  if (node.kind === 'symbol') {
    return [
      escapeHtml(node.name),
      `${formatBytes(node.bytes)} | ${formatPercent(node.percent)}`,
      escapeHtml(`${node.regionName ?? ''} / ${node.sectionName ?? ''}`),
      node.address !== undefined ? `VMA ${formatHex(node.address)}` : '',
    ]
      .filter(Boolean)
      .join('<br/>');
  }

  return [
    escapeHtml(`${node.regionName ?? ''} / ${node.sectionName ?? ''} / ${node.name}`),
    `${formatBytes(node.bytes)} | ${formatPercent(node.percent)}`,
  ].join('<br/>');
}

function getTreemapNode(params: unknown): MemoryTreemapNode | null {
  const item = Array.isArray(params) ? params[0] : params;

  if (!isRecord(item) || !isRecord(item.data)) {
    return null;
  }

  const { data } = item;
  if (typeof data.name !== 'string' || typeof data.bytes !== 'number' || typeof data.percent !== 'number') {
    return null;
  }

  return data as unknown as MemoryTreemapNode;
}

function formatTreemapLabel(params: unknown): string {
  const node = getTreemapNode(params);

  if (!node) {
    return '';
  }

  if (node.kind === 'region') {
    const region = store.regions.find(item => item.name === node.regionName);
    const totalBytes = region ? totalBytesForRegion(region) : node.bytes;
    const usedPercent = region ? percentage(region.runtimeUsed, totalBytes) : 0;

    return `${node.name}\n${formatBytes(totalBytes)}\n${formatPercent(usedPercent)} ${t('memoryMap.regions.usedLabel')}`;
  }

  return `${node.name}\n${formatBytes(node.bytes)}`;
}

function formatSectionTooltip(params: unknown): string {
  const datum = getSectionBarDatum(params);

  if (!datum) {
    return '';
  }

  const lines = [
    escapeHtml(datum.name),
    `${formatBytes(datum.size)} | ${escapeHtml(datum.regionName ?? t('common.notAvailable'))}`,
    `VMA ${formatHex(datum.address)}`,
  ];

  if (datum.loadAddress !== undefined) {
    lines.push(`LMA ${formatHex(datum.loadAddress)}`);
  }
  if (datum.loadRegionName && datum.loadRegionName !== datum.regionName) {
    lines.push(escapeHtml(t('memoryMap.sections.loadRegion', { region: datum.loadRegionName })));
  }

  return lines.join('<br/>');
}

function getSectionBarDatum(params: unknown): SectionBarDatum | null {
  const item = Array.isArray(params) ? params[0] : params;

  if (!isRecord(item) || !isRecord(item.data)) {
    return null;
  }

  const { data } = item;
  if (typeof data.name !== 'string' || typeof data.size !== 'number' || typeof data.address !== 'number') {
    return null;
  }

  return data as unknown as SectionBarDatum;
}

function formatSectionBarLabel(params: unknown): string {
  const datum = getSectionBarDatum(params);
  return datum ? formatBytes(datum.size) : '';
}

function formatAxisBytes(value: unknown): string {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? formatBytes(numericValue) : '';
}

function shortenAxisLabel(value: string): string {
  return value.length > 14 ? `${value.slice(0, 13)}...` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    if (char === '&') {
      return '&amp;';
    }
    if (char === '<') {
      return '&lt;';
    }
    if (char === '>') {
      return '&gt;';
    }
    if (char === '"') {
      return '&quot;';
    }
    return '&#39;';
  });
}

function addFilter() {
  symbolFilters.value = [...symbolFilters.value, createFilter()];
}

function createFilter(field: SymbolFilterField = 'name'): SymbolFilter {
  return {
    id: `filter-${nextFilterId++}`,
    field,
    operator: defaultOperatorForField(field),
    value: '',
    sizeUnit: 'KiB',
  };
}

function removeFilter(filterId: string) {
  symbolFilters.value = symbolFilters.value.filter(filter => filter.id !== filterId);
}

function handleFilterFieldChange(filter: SymbolFilter) {
  filter.operator = defaultOperatorForField(filter.field);
  filter.value = '';
}

function normalizeFilterOperator(filter: SymbolFilter) {
  const allowedOperators = operatorOptionsFor(filter.field).map(option => option.value);
  if (!allowedOperators.includes(filter.operator)) {
    filter.operator = defaultOperatorForField(filter.field);
  }
}

function clearFilters() {
  symbolFilters.value = [];
  sortMode.value = 'size';
}

function operatorOptionsFor(field: SymbolFilterField): Array<SelectOption<SymbolFilterOperator>> {
  return isNumericField(field) ? numericOperators.value : textOperators.value;
}

function valueOptionsFor(field: SymbolFilterField): SelectOption[] {
  if (field === 'region') {
    return regionFilters.value.map(region => ({
      value: region.name,
      label: `${region.name} (${region.count})`,
    }));
  }

  if (field === 'section') {
    return sectionFilters.value.map(section => ({
      value: section.name,
      label: `${section.name} (${section.count})`,
    }));
  }

  return [];
}

function valuePlaceholderFor(field: SymbolFilterField): string {
  if (field === 'size') {
    return t('memoryMap.filters.sizePlaceholder');
  }
  if (field === 'address') {
    return t('memoryMap.filters.addressPlaceholder');
  }
  return t('memoryMap.filters.valuePlaceholder');
}

function isFilterComplete(filter: SymbolFilter): boolean {
  if (!filter.value.trim()) {
    return false;
  }

  if (isNumericField(filter.field)) {
    return Number.isFinite(parseNumericFilterValue(filter));
  }

  return true;
}

function matchesFilter(symbol: MemorySymbolEntry, filter: SymbolFilter): boolean {
  if (isNumericField(filter.field)) {
    return matchesNumericFilter(symbol, filter);
  }

  return matchesTextFilter(symbol, filter);
}

function matchesTextFilter(symbol: MemorySymbolEntry, filter: SymbolFilter): boolean {
  const needle = filter.value.trim().toLowerCase();
  const values = textValuesForField(symbol, filter.field).map(value => value.toLowerCase());

  if (filter.operator === 'equals') {
    return values.some(value => value === needle);
  }
  if (filter.operator === 'notEquals') {
    return values.every(value => value !== needle);
  }
  if (filter.operator === 'startsWith') {
    return values.some(value => value.startsWith(needle));
  }
  if (filter.operator === 'endsWith') {
    return values.some(value => value.endsWith(needle));
  }
  return values.some(value => value.includes(needle));
}

function matchesNumericFilter(symbol: MemorySymbolEntry, filter: SymbolFilter): boolean {
  const current = numericValueForField(symbol, filter.field);
  const expected = parseNumericFilterValue(filter);

  if (!Number.isFinite(expected)) {
    return true;
  }
  if (filter.operator === 'lessThan') {
    return current < expected;
  }
  if (filter.operator === 'equals') {
    return current === expected;
  }
  if (filter.operator === 'notEquals') {
    return current !== expected;
  }
  return current > expected;
}

function textValuesForField(symbol: MemorySymbolEntry, field: SymbolFilterField): string[] {
  if (field === 'region') {
    return [symbol.regionName ?? ''];
  }
  if (field === 'section') {
    return [symbol.outputSection, symbol.section];
  }
  if (field === 'object') {
    return [symbol.objectPath];
  }
  return [symbol.name];
}

function numericValueForField(symbol: MemorySymbolEntry, field: SymbolFilterField): number {
  return field === 'address' ? symbol.address : symbol.size;
}

function parseNumericFilterValue(filter: SymbolFilter): number {
  return filter.field === 'address' ? parseAddressInput(filter.value) : parseSizeInput(filter.value, filter.sizeUnit);
}

function parseAddressInput(input: string): number {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return Number.NaN;
  }
  if (trimmed.startsWith('0x')) {
    return /^0x[0-9a-f]+$/.test(trimmed) ? Number.parseInt(trimmed.slice(2), 16) : Number.NaN;
  }
  return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : Number.NaN;
}

function defaultOperatorForField(field: SymbolFilterField): SymbolFilterOperator {
  if (isNumericField(field)) {
    return 'greaterThan';
  }
  return field === 'region' || field === 'section' ? 'equals' : 'contains';
}

function isNumericField(field: SymbolFilterField): boolean {
  return field === 'size' || field === 'address';
}

function chipClass(active: boolean) {
  return active
    ? 'border-vscode-button-background bg-vscode-button-background text-vscode-button-foreground'
    : 'border-vscode-panel-border bg-vscode-background text-vscode-foreground hover:bg-vscode-input-background';
}

function parseSizeInput(input: string, unit: SizeUnit): number {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return Number.NaN;
  }

  const match = trimmed.match(/^\d+(?:\.\d+)?$/);
  if (!match) {
    return Number.NaN;
  }

  const value = Number.parseFloat(trimmed);
  if (unit === 'MiB') {
    return Math.floor(value * 1024 * 1024);
  }
  if (unit === 'KiB') {
    return Math.floor(value * 1024);
  }
  return Math.floor(value);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatPercent(percent: number): string {
  if (!Number.isFinite(percent)) {
    return '0%';
  }
  return `${percent.toFixed(percent >= 10 ? 1 : 2)}%`;
}

function percentage(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

function formatHex(value: number): string {
  return `0x${value.toString(16).padStart(8, '0')}`;
}

function shortenObjectPath(objectPath: string): string {
  const normalized = objectPath.replace(/\\/g, '/');
  const archiveMatch = normalized.match(/([^/]+\.a\(.+\))$/);
  if (archiveMatch) {
    return archiveMatch[1];
  }

  const parts = normalized.split('/');
  return parts.length <= 3 ? normalized : parts.slice(-3).join('/');
}
</script>

<style scoped>
.filter-chip {
  border-width: 1px;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 12px;
  line-height: 1.1;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.filter-chip:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.filter-control {
  min-height: 34px;
  width: 100%;
  border: 1px solid var(--vscode-input-border);
  border-radius: 8px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  padding: 5px 9px;
  font-size: 12px;
  line-height: 1.2;
  outline: none;
}

.filter-control:focus {
  border-color: var(--vscode-focusBorder);
  box-shadow: 0 0 0 1px var(--vscode-focusBorder);
}
</style>
