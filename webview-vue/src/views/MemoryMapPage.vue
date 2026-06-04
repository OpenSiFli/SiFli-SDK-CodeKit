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

            <div class="mt-4 space-y-4">
              <article
                v-for="chart in regionCharts"
                :key="chart.region.name"
                class="rounded-lg border border-vscode-panel-border bg-vscode-input-background/25 px-5 py-5"
              >
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-semibold">{{ chart.region.name }}</p>
                    <p class="font-mono text-xs text-vscode-input-placeholder">
                      {{ formatHex(chart.region.origin) }} | {{ formatBytes(chart.region.length) }}
                    </p>
                  </div>
                  <p class="text-right text-xs text-vscode-input-placeholder">
                    {{ chart.region.attributes || t('common.notAvailable') }}
                  </p>
                </div>

                <div class="mt-5 grid gap-5 md:grid-cols-[200px_minmax(0,1fr)] md:items-center">
                  <div
                    class="relative mx-auto h-44 w-44 rounded-full md:h-48 md:w-48"
                    :style="{ background: chart.gradient }"
                    :aria-label="chart.region.name"
                  >
                    <div
                      class="absolute inset-6 flex flex-col items-center justify-center rounded-full border border-vscode-panel-border bg-vscode-background text-center"
                    >
                      <span class="text-2xl font-semibold">{{ formatPercent(chart.usedPercent) }}</span>
                      <span class="mt-1 text-xs uppercase tracking-[0.16em] text-vscode-input-placeholder">
                        {{ t('memoryMap.regions.usedLabel') }}
                      </span>
                    </div>
                  </div>

                  <div class="space-y-2">
                    <div
                      v-for="segment in chart.legend"
                      :key="`${chart.region.name}-${segment.label}`"
                      class="grid grid-cols-[12px_minmax(0,1fr)_116px] items-center gap-3 text-xs"
                    >
                      <span class="h-3 w-3 rounded-sm" :style="{ background: segment.color }"></span>
                      <span class="truncate" :title="segment.label">{{ segment.label }}</span>
                      <span class="text-right font-mono text-vscode-input-placeholder">
                        {{ formatBytes(segment.bytes) }} | {{ formatPercent(segment.percent) }}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="mt-5 grid gap-3 text-xs text-vscode-input-placeholder sm:grid-cols-2">
                  <div>
                    {{ t('memoryMap.regions.runtime') }}:
                    <span class="font-semibold text-vscode-foreground">{{
                      formatBytes(chart.region.runtimeUsed)
                    }}</span>
                  </div>
                  <div>
                    {{ t('memoryMap.regions.load') }}:
                    <span class="font-semibold text-vscode-foreground">{{ formatBytes(chart.region.loadUsed) }}</span>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div class="rounded-2xl border border-vscode-panel-border bg-vscode-background px-5 py-5 shadow-sm">
            <h3 class="text-lg font-semibold">{{ t('memoryMap.sections.title') }}</h3>
            <div class="mt-4 space-y-3">
              <article
                v-for="section in orderedSections"
                :key="`${section.name}-${section.address}`"
                class="rounded-lg border border-vscode-panel-border bg-vscode-input-background/30 px-3 py-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-mono text-sm font-semibold">{{ section.name }}</p>
                    <p class="mt-1 font-mono text-xs text-vscode-input-placeholder">
                      {{ formatHex(section.address) }}
                      <template v-if="section.loadAddress !== undefined">
                        | LMA {{ formatHex(section.loadAddress) }}
                      </template>
                    </p>
                  </div>
                  <p class="text-right text-sm font-semibold">{{ formatBytes(section.size) }}</p>
                </div>
                <div class="mt-2 h-2 overflow-hidden rounded-full bg-vscode-input-background">
                  <div
                    class="h-full rounded-full bg-vscode-button-background"
                    :style="barStyle(section.size, largestSectionSize)"
                  ></div>
                </div>
                <p class="mt-2 text-xs text-vscode-input-placeholder">
                  {{ section.regionName || t('common.notAvailable') }}
                  <template v-if="section.loadRegionName && section.loadRegionName !== section.regionName">
                    | {{ t('memoryMap.sections.loadRegion', { region: section.loadRegionName }) }}
                  </template>
                </p>
              </article>
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
                  class="grid gap-2 rounded-lg border border-vscode-panel-border bg-vscode-background px-2 py-2 lg:grid-cols-[190px_170px_minmax(0,1fr)_34px]"
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
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/common/BaseButton.vue';
import { useMemoryMapStore } from '@/stores/memoryMap';
import type { MemoryRegionUsage, MemorySymbolEntry } from '@/types';

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

interface DonutSegment {
  label: string;
  bytes: number;
  percent: number;
  color: string;
  kind: 'symbol' | 'other' | 'free';
}

interface RegionChart {
  region: MemoryRegionUsage;
  usedPercent: number;
  gradient: string;
  legend: DonutSegment[];
}

const store = useMemoryMapStore();
const { t } = useI18n();
const symbolFilters = ref<SymbolFilter[]>([]);
const sortMode = ref<SortMode>('size');
let nextFilterId = 1;

const donutColors = ['#4f8cff', '#35c2a1', '#f7b955', '#ef6f6c', '#b88cff', '#6fc3df', '#a0c95a'];
const otherColor = '#8a8f98';
const freeColor = 'color-mix(in srgb, var(--vscode-panel-border) 45%, transparent)';

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

const largestSectionSize = computed(() => orderedSections.value[0]?.size ?? 0);

const effectiveFilters = computed(() => symbolFilters.value.filter(isFilterComplete));

const canResetFilters = computed(() => symbolFilters.value.length > 0 || sortMode.value !== 'size');

const regionCharts = computed<RegionChart[]>(() => store.regions.map(region => buildRegionChart(region)));

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
  store.fetchSnapshot();
});

function buildRegionChart(region: MemoryRegionUsage): RegionChart {
  const totalBytes = region.length > 0 ? region.length : Math.max(region.runtimeUsed, 1);
  const symbols = store.symbols
    .filter(symbol => symbol.regionName === region.name)
    .sort((left, right) => right.size - left.size);
  const topSymbols = symbols.slice(0, donutColors.length);
  const symbolSegments = topSymbols.map((symbol, index) => createSymbolSegment(symbol, totalBytes, donutColors[index]));
  const accountedBytes = topSymbols.reduce((sum, symbol) => sum + symbol.size, 0);
  const otherBytes = Math.max(region.runtimeUsed - accountedBytes, 0);
  const freeBytes = Math.max(totalBytes - region.runtimeUsed, 0);
  const segments: DonutSegment[] = [...symbolSegments];

  if (otherBytes > 0) {
    segments.push({
      label: t('memoryMap.regions.otherSymbols'),
      bytes: otherBytes,
      percent: percentage(otherBytes, totalBytes),
      color: otherColor,
      kind: 'other',
    });
  }

  if (freeBytes > 0) {
    segments.push({
      label: t('memoryMap.regions.free'),
      bytes: freeBytes,
      percent: percentage(freeBytes, totalBytes),
      color: freeColor,
      kind: 'free',
    });
  }

  if (segments.length === 0) {
    segments.push({
      label: t('memoryMap.regions.free'),
      bytes: totalBytes,
      percent: 100,
      color: freeColor,
      kind: 'free',
    });
  }

  return {
    region,
    usedPercent: percentage(region.runtimeUsed, totalBytes),
    gradient: buildConicGradient(segments),
    legend: segments,
  };
}

function createSymbolSegment(symbol: MemorySymbolEntry, totalBytes: number, color: string): DonutSegment {
  return {
    label: symbol.name,
    bytes: symbol.size,
    percent: percentage(symbol.size, totalBytes),
    color,
    kind: 'symbol',
  };
}

function buildConicGradient(segments: DonutSegment[]): string {
  let cursor = 0;
  const stops = segments.map((segment, index) => {
    const next = index === segments.length - 1 ? 100 : Math.min(100, cursor + segment.percent);
    const stop = `${segment.color} ${cursor.toFixed(3)}% ${next.toFixed(3)}%`;
    cursor = next;
    return stop;
  });

  return `conic-gradient(${stops.join(', ')})`;
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

function barStyle(value: number, max: number) {
  const percent = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return {
    width: `${percent}%`,
  };
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
