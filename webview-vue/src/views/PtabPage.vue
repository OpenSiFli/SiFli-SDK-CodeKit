<template>
  <section class="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
    <header class="shrink-0 border-b border-vscode-panel-border pb-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs uppercase text-vscode-input-placeholder">{{ t('ptab.sectionLabel') }}</p>
          <h2 class="mt-1 text-2xl font-semibold leading-tight">{{ t('ptab.title') }}</h2>
          <div v-if="snapshot" class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-vscode-input-placeholder">
            <span>{{ snapshot.normalizedBoardName }}</span>
            <span>{{ snapshot.chip || snapshot.chipDir }}</span>
            <button class="min-w-0 truncate hover:underline" @click="store.openSource(snapshot.paths.effectivePath)">
              {{ compactPath(snapshot.paths.effectivePath) }}
            </button>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <BaseButton variant="secondary" size="sm" @click="store.openDocs()">
            {{ t('ptab.actions.docs') }}
          </BaseButton>
          <BaseButton
            variant="secondary"
            size="sm"
            :disabled="store.loading || store.saving"
            @click="store.fetchSnapshot()"
          >
            {{ t('ptab.actions.refresh') }}
          </BaseButton>
          <BaseButton
            variant="secondary"
            size="sm"
            :disabled="!store.dirty || store.saving"
            @click="store.discardDraft()"
          >
            {{ t('ptab.actions.discard') }}
          </BaseButton>
          <BaseButton
            variant="secondary"
            size="sm"
            :loading="store.previewing"
            :disabled="!store.canPreview"
            @click="store.previewChanges()"
          >
            {{ t('ptab.actions.preview') }}
          </BaseButton>
          <BaseButton
            variant="primary"
            size="sm"
            :loading="store.saving"
            :disabled="!store.canSave"
            @click="store.saveChanges()"
          >
            {{ t('ptab.actions.save') }}
          </BaseButton>
        </div>
      </div>
    </header>

    <div v-if="store.error" class="shrink-0 border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
      <div class="flex items-start justify-between gap-3">
        <span>{{ store.error }}</span>
        <button class="text-xs uppercase tracking-[0.16em] text-vscode-input-placeholder" @click="store.clearError()">
          {{ t('common.close') }}
        </button>
      </div>
    </div>

    <div
      v-if="store.loading && !snapshot"
      class="flex min-h-0 flex-1 items-center justify-center text-vscode-input-placeholder"
    >
      {{ t('common.loading') }}
    </div>

    <div v-else-if="!snapshot" class="flex min-h-0 flex-1 items-center justify-center text-vscode-input-placeholder">
      {{ t('ptab.empty') }}
    </div>

    <Splitpanes
      v-else
      class="ptab-workspace"
      :push-other-panes="false"
      :maximize-panes="false"
      @resized="handleWorkspaceResized"
    >
      <Pane :size="paneLayout.main" :min-size="45">
        <main class="ptab-main">
          <Splitpanes
            class="ptab-main-splitter"
            horizontal
            :push-other-panes="false"
            :maximize-panes="false"
            @resized="handleMainResized"
          >
            <Pane :size="paneLayout.chart" :min-size="28">
              <section class="ptab-chart-pane border border-vscode-panel-border bg-vscode-background">
                <div class="grid gap-2 border-b border-vscode-panel-border p-3 md:grid-cols-4">
                  <div class="summary-tile">
                    <span>{{ t('ptab.summary.regions') }}</span>
                    <strong>{{ snapshot.regions.length }}</strong>
                  </div>
                  <div class="summary-tile">
                    <span>{{ t('ptab.summary.partitions') }}</span>
                    <strong>{{ snapshot.partitions.length }}</strong>
                  </div>
                  <div class="summary-tile">
                    <span>{{ t('ptab.summary.gaps') }}</span>
                    <strong>{{ snapshot.gaps.length }}</strong>
                  </div>
                  <div class="summary-tile" :class="snapshot.overlaps.length > 0 ? 'text-red-200' : ''">
                    <span>{{ t('ptab.summary.overlaps') }}</span>
                    <strong>{{ snapshot.overlaps.length }}</strong>
                  </div>
                </div>

                <div class="ptab-chart-body border-b border-vscode-panel-border bg-vscode-input-background/20">
                  <div class="flex flex-wrap items-center justify-between gap-2 px-3 pt-3 text-xs">
                    <div>
                      <h3 class="text-sm font-medium">{{ t('ptab.layout.title') }}</h3>
                      <p class="mt-1 text-vscode-input-placeholder">{{ t('ptab.layout.subtitle') }}</p>
                    </div>
                    <div class="flex flex-wrap gap-x-3 gap-y-1 text-vscode-input-placeholder">
                      <span class="legend-item"
                        ><i class="legend-swatch legend-swatch--storage" />{{ t('ptab.layout.storage') }}</span
                      >
                      <span class="legend-item"
                        ><i class="legend-swatch legend-swatch--exec" />{{ t('ptab.layout.exec') }}</span
                      >
                      <span class="legend-item"
                        ><i class="legend-swatch legend-swatch--gap" />{{ t('ptab.layout.gap') }}</span
                      >
                      <span class="legend-item"
                        ><i class="legend-swatch legend-swatch--overlap" />{{ t('ptab.layout.overlap') }}</span
                      >
                    </div>
                  </div>
                  <div class="layout-chart-shell p-2">
                    <VChart
                      v-if="hasLayoutItems"
                      class="h-full w-full"
                      :option="layoutChartOption"
                      :init-options="chartInitOptions"
                      :autoresize="chartResizeOptions"
                      @click="handleLayoutClick"
                    />
                    <div v-else class="flex h-full items-center justify-center text-sm text-vscode-input-placeholder">
                      {{ t('ptab.layout.empty') }}
                    </div>
                  </div>
                </div>

                <div
                  v-if="snapshot.validation.length || snapshot.overlayOperations.length"
                  class="grid gap-2 p-3 lg:grid-cols-2"
                >
                  <div v-if="snapshot.validation.length" class="space-y-1 text-xs">
                    <p class="font-medium">{{ t('ptab.validation.title') }}</p>
                    <p
                      v-for="issue in snapshot.validation"
                      :key="`${issue.severity}-${issue.message}`"
                      :class="issue.severity === 'error' ? 'text-red-200' : 'text-amber-100'"
                    >
                      {{ issue.message }}
                    </p>
                  </div>
                  <div v-if="snapshot.overlayOperations.length" class="space-y-1 text-xs">
                    <p class="font-medium">{{ t('ptab.overlay.title') }}</p>
                    <p v-for="op in snapshot.overlayOperations" :key="`${op.source}-${op.name}-${op.kind}`">
                      {{ op.layer }} / {{ op.kind }} / {{ op.name }}: {{ op.fields.join(', ') || '-' }}
                    </p>
                  </div>
                </div>
              </section>
            </Pane>

            <Pane :size="paneLayout.table" :min-size="22">
              <section
                class="flex h-full min-h-0 flex-col overflow-hidden border border-vscode-panel-border bg-vscode-background"
              >
                <div class="shrink-0 border-b border-vscode-panel-border p-3">
                  <div class="grid gap-2 md:grid-cols-[minmax(160px,1fr)_150px_150px_150px_120px]">
                    <input v-model.trim="query" class="ptab-input" :placeholder="t('ptab.filters.search')" />
                    <select v-model="regionFilter" class="ptab-input">
                      <option value="">{{ t('ptab.filters.allRegions') }}</option>
                      <option v-for="region in regionOptions" :key="region" :value="region">{{ region }}</option>
                    </select>
                    <select v-model="typeFilter" class="ptab-input">
                      <option value="">{{ t('ptab.filters.allTypes') }}</option>
                      <option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</option>
                    </select>
                    <select v-model="coreFilter" class="ptab-input">
                      <option value="">{{ t('ptab.filters.allCores') }}</option>
                      <option v-for="core in coreOptions" :key="core" :value="core">{{ core }}</option>
                    </select>
                    <BaseButton variant="secondary" size="sm" @click="clearFilters">{{
                      t('ptab.filters.reset')
                    }}</BaseButton>
                  </div>
                </div>

                <div class="min-h-0 flex-1 overflow-auto">
                  <table class="w-full table-fixed border-collapse text-sm">
                    <thead
                      class="sticky top-0 z-10 bg-vscode-background text-left text-xs uppercase text-vscode-input-placeholder"
                    >
                      <tr>
                        <th class="w-[24%] px-3 py-2">{{ t('ptab.table.name') }}</th>
                        <th class="w-[12%] px-3 py-2">{{ t('ptab.table.type') }}</th>
                        <th class="w-[12%] px-3 py-2">{{ t('ptab.table.region') }}</th>
                        <th class="w-[15%] px-3 py-2">{{ t('ptab.table.offset') }}</th>
                        <th class="w-[15%] px-3 py-2">{{ t('ptab.table.size') }}</th>
                        <th class="w-[10%] px-3 py-2">{{ t('ptab.table.core') }}</th>
                        <th class="w-[12%] px-3 py-2">{{ t('ptab.table.source') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="partition in filteredPartitions"
                        :key="partition.name"
                        class="cursor-pointer border-t border-vscode-panel-border hover:bg-vscode-input-background/45"
                        :class="
                          partition.name === store.selectedPartitionName
                            ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                            : ''
                        "
                        @click="store.selectPartition(partition.name)"
                      >
                        <td class="truncate px-3 py-2 font-medium">{{ partition.name }}</td>
                        <td class="truncate px-3 py-2">
                          {{ partition.type }}{{ partition.subtype ? `/${partition.subtype}` : '' }}
                        </td>
                        <td class="truncate px-3 py-2 font-mono text-xs">{{ partition.region }}</td>
                        <td class="truncate px-3 py-2 font-mono text-xs">
                          {{ partition.offset_hex || partition.offset }}
                        </td>
                        <td class="truncate px-3 py-2 font-mono text-xs">{{ partition.size_hex || partition.size }}</td>
                        <td class="truncate px-3 py-2">{{ partition.core || '-' }}</td>
                        <td class="truncate px-3 py-2">{{ sourceLabel(partition.source) }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div
                    v-if="filteredPartitions.length === 0"
                    class="px-3 py-10 text-center text-sm text-vscode-input-placeholder"
                  >
                    {{ t('ptab.filters.empty') }}
                  </div>
                </div>
              </section>
            </Pane>
          </Splitpanes>
        </main>
      </Pane>

      <Pane :size="paneLayout.editor" :min-size="20" :max-size="46">
        <aside
          class="flex h-full min-h-0 flex-col overflow-hidden border border-vscode-panel-border bg-vscode-background"
        >
          <div class="shrink-0 border-b border-vscode-panel-border p-3">
            <div class="flex items-center justify-between gap-2">
              <div>
                <h3 class="text-base font-semibold">{{ t('ptab.editor.title') }}</h3>
                <p class="mt-1 text-xs text-vscode-input-placeholder">{{ targetDescription }}</p>
              </div>
              <BaseButton variant="secondary" size="sm" @click="store.addPartition()">{{
                t('ptab.actions.add')
              }}</BaseButton>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-auto p-3">
            <div class="space-y-3">
              <label class="block text-xs">
                <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.target') }}</span>
                <select
                  class="ptab-input w-full"
                  :value="store.selectedTargetKind"
                  @change="store.setTarget(($event.target as HTMLSelectElement).value as PtabEditTargetKind)"
                >
                  <option v-for="target in store.editTargets" :key="target.kind" :value="target.kind">
                    {{ target.label }}{{ target.recommended ? ` (${t('ptab.editor.recommended')})` : '' }}
                  </option>
                </select>
              </label>

              <div
                v-if="store.selectedTarget && !store.selectedTarget.editable"
                class="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
              >
                {{ store.selectedTarget.reason }}
              </div>

              <button
                v-if="store.selectedTarget?.path"
                class="max-w-full truncate text-left font-mono text-xs text-vscode-input-placeholder hover:underline"
                @click="store.openSource(store.selectedTarget?.path)"
              >
                {{ store.selectedTarget.path }}
              </button>

              <template v-if="store.draft">
                <div class="grid grid-cols-2 gap-2">
                  <label class="text-xs">
                    <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.operation') }}</span>
                    <select
                      class="ptab-input w-full"
                      :value="store.draft.operation || 'override'"
                      :disabled="!store.draft.originalName"
                      @change="
                        store.updateDraft({
                          operation: ($event.target as HTMLSelectElement).value as PtabPartitionOperation,
                        })
                      "
                    >
                      <option v-if="store.draft.originalName" value="override">{{ t('ptab.editor.override') }}</option>
                      <option value="add">{{ t('ptab.editor.add') }}</option>
                    </select>
                  </label>
                  <label class="text-xs">
                    <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.name') }}</span>
                    <input
                      class="ptab-input w-full"
                      :value="store.draft.name"
                      @input="store.updateDraft({ name: ($event.target as HTMLInputElement).value })"
                    />
                  </label>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <label class="text-xs">
                    <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.type') }}</span>
                    <select
                      class="ptab-input w-full"
                      :value="store.draft.type"
                      @change="handleTypeChange(($event.target as HTMLSelectElement).value)"
                    >
                      <option v-for="type in editTypeOptions" :key="type" :value="type">{{ type }}</option>
                    </select>
                  </label>
                  <label class="text-xs">
                    <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.subtype') }}</span>
                    <select
                      class="ptab-input w-full"
                      :value="store.draft.subtype || ''"
                      @change="store.updateDraft({ subtype: ($event.target as HTMLSelectElement).value })"
                    >
                      <option value="">{{ t('common.notAvailable') }}</option>
                      <option v-for="subtype in editSubtypeOptions" :key="subtype" :value="subtype">
                        {{ subtype }}
                      </option>
                    </select>
                  </label>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <label class="text-xs">
                    <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.region') }}</span>
                    <select
                      class="ptab-input w-full"
                      :value="store.draft.region"
                      @change="store.updateDraft({ region: ($event.target as HTMLSelectElement).value })"
                    >
                      <option v-for="region in editRegionOptions" :key="region" :value="region">{{ region }}</option>
                    </select>
                  </label>
                  <label class="text-xs">
                    <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.size') }}</span>
                    <div class="measurement-control">
                      <input
                        class="ptab-input measurement-control__value font-mono"
                        inputmode="numeric"
                        min="0"
                        pattern="[0-9]*"
                        step="1"
                        type="number"
                        :value="store.draft.sizeValue"
                        @input="store.updateMeasurement('size', { value: ($event.target as HTMLInputElement).value })"
                      />
                      <select
                        class="ptab-input measurement-control__unit"
                        :value="store.draft.sizeUnit || 'B'"
                        @change="
                          store.updateMeasurement('size', {
                            unit: ($event.target as HTMLSelectElement).value as PtabSizeUnit,
                          })
                        "
                      >
                        <option v-for="unit in store.sizeUnits" :key="unit.value" :value="unit.value">
                          {{ unit.label }}
                        </option>
                      </select>
                    </div>
                  </label>
                </div>

                <label class="block text-xs">
                  <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.offset') }}</span>
                  <div class="measurement-control measurement-control--wide">
                    <input
                      class="ptab-input measurement-control__value font-mono"
                      inputmode="numeric"
                      min="0"
                      pattern="[0-9]*"
                      step="1"
                      type="number"
                      :value="store.draft.offsetValue"
                      @input="store.updateMeasurement('offset', { value: ($event.target as HTMLInputElement).value })"
                    />
                    <select
                      class="ptab-input measurement-control__unit"
                      :value="store.draft.offsetUnit || 'B'"
                      @change="
                        store.updateMeasurement('offset', {
                          unit: ($event.target as HTMLSelectElement).value as PtabSizeUnit,
                        })
                      "
                    >
                      <option v-for="unit in store.sizeUnits" :key="unit.value" :value="unit.value">
                        {{ unit.label }}
                      </option>
                    </select>
                  </div>
                </label>

                <div class="grid grid-cols-2 gap-2">
                  <label class="text-xs">
                    <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.core') }}</span>
                    <select
                      class="ptab-input w-full"
                      :value="store.draft.core || ''"
                      @change="store.updateDraft({ core: ($event.target as HTMLSelectElement).value })"
                    >
                      <option value="">{{ t('common.notAvailable') }}</option>
                      <option v-for="core in editCoreOptions" :key="core" :value="core">{{ core }}</option>
                    </select>
                  </label>
                  <label class="text-xs">
                    <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.execRegion') }}</span>
                    <select
                      class="ptab-input w-full"
                      :value="store.draft.execRegion || ''"
                      @change="store.updateDraft({ execRegion: ($event.target as HTMLSelectElement).value })"
                    >
                      <option value="">{{ t('common.notAvailable') }}</option>
                      <option v-for="region in editRegionOptions" :key="region" :value="region">{{ region }}</option>
                    </select>
                  </label>
                </div>

                <label class="block text-xs">
                  <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.execOffset') }}</span>
                  <div class="measurement-control measurement-control--wide">
                    <input
                      class="ptab-input measurement-control__value font-mono"
                      inputmode="numeric"
                      min="0"
                      pattern="[0-9]*"
                      step="1"
                      type="number"
                      :value="store.draft.execOffsetValue"
                      @input="
                        store.updateMeasurement('execOffset', { value: ($event.target as HTMLInputElement).value })
                      "
                    />
                    <select
                      class="ptab-input measurement-control__unit"
                      :value="store.draft.execOffsetUnit || 'B'"
                      @change="
                        store.updateMeasurement('execOffset', {
                          unit: ($event.target as HTMLSelectElement).value as PtabSizeUnit,
                        })
                      "
                    >
                      <option v-for="unit in store.sizeUnits" :key="unit.value" :value="unit.value">
                        {{ unit.label }}
                      </option>
                    </select>
                  </div>
                </label>

                <label class="block text-xs">
                  <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.attrs') }}</span>
                  <textarea
                    class="ptab-textarea"
                    rows="4"
                    :value="store.draft.attrsYaml"
                    @input="store.updateDraft({ attrsYaml: ($event.target as HTMLTextAreaElement).value })"
                  />
                </label>

                <label class="block text-xs">
                  <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.aliases') }}</span>
                  <textarea
                    class="ptab-textarea"
                    rows="3"
                    :value="store.draft.aliasesYaml"
                    @input="store.updateDraft({ aliasesYaml: ($event.target as HTMLTextAreaElement).value })"
                  />
                </label>

                <label class="block text-xs">
                  <span class="mb-1 block text-vscode-input-placeholder">{{ t('ptab.editor.sections') }}</span>
                  <textarea
                    class="ptab-textarea"
                    rows="5"
                    :value="store.draft.sectionsYaml"
                    @input="store.updateDraft({ sectionsYaml: ($event.target as HTMLTextAreaElement).value })"
                  />
                </label>
              </template>
            </div>
          </div>
        </aside>
      </Pane>
    </Splitpanes>
  </section>
</template>

<script setup lang="ts">
import { CustomChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { graphic, use } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import VChart from 'vue-echarts';
import { Pane, Splitpanes } from 'splitpanes';
import type { SplitpanesResizedPayload } from 'splitpanes';
import 'splitpanes/dist/splitpanes.css';
import BaseButton from '@/components/common/BaseButton.vue';
import { usePtabStore } from '@/stores/ptab';
import type {
  PtabEditTargetKind,
  PtabGap,
  PtabOverlap,
  PtabPartition,
  PtabPartitionOperation,
  PtabRegionUsage,
  PtabSizeUnit,
  PtabUsageEntry,
} from '@/types';

type ChartOption = Record<string, unknown>;
type LayoutItemKind = 'track' | 'storage' | 'exec' | 'gap' | 'overlap';

const defaultTypeSubtypes: Record<string, string[]> = {
  app: ['factory', 'dfu', 'ex'],
  data: ['raw', 'filesystem', 'flashdb_kv', 'ram'],
  bootloader: [],
  ftab: [],
};

interface LayoutDatum {
  value: [number, number, number];
  name: string;
  kind: LayoutItemKind;
  type: string;
  subtype: string;
  region: string;
  offset: number;
  endOffset: number;
  sizeBytes: number;
  capacityBytes: number;
  color: string;
  memoryType?: string;
  usedBytes?: number;
  freeBytes?: number | null;
  usagePercent?: number | null;
  source?: PtabPartition['source'];
}

interface LayoutRenderApi {
  value: (index: number) => number | string;
  coord: (value: unknown[]) => number[];
  size: (value: number[]) => number[];
  style: (style: Record<string, unknown>) => Record<string, unknown>;
}

interface LayoutRenderParams {
  dataIndex?: number;
  coordSys?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  data?: LayoutDatum;
}

use([CustomChart, GridComponent, TooltipComponent, SVGRenderer]);

const store = usePtabStore();
const { t } = useI18n();

const query = ref('');
const regionFilter = ref('');
const typeFilter = ref('');
const coreFilter = ref('');
const chartInitOptions = { renderer: 'svg' as const };
const chartResizeOptions = { throttle: 120 };
const panePrefsStorageKey = 'codekit.ptab.panes.v1';

interface PaneLayout {
  main: number;
  editor: number;
  chart: number;
  table: number;
}

const defaultPaneLayout: PaneLayout = {
  main: 74,
  editor: 26,
  chart: 58,
  table: 42,
};

const paneLayout = ref<PaneLayout>({ ...defaultPaneLayout });

const snapshot = computed(() => store.snapshot);
const hasLayoutItems = computed(() => {
  const currentSnapshot = snapshot.value;
  return (
    !!currentSnapshot &&
    (currentSnapshot.usageEntries.length > 0 || currentSnapshot.gaps.length > 0 || currentSnapshot.overlaps.length > 0)
  );
});

const regionOptions = computed(() => [...new Set(store.partitions.map(partition => partition.region))].sort());
const typeOptions = computed(() => [...new Set(store.partitions.map(partition => partition.type))].sort());
const coreOptions = computed(() =>
  [...new Set(store.partitions.map(partition => partition.core).filter((core): core is string => !!core))].sort()
);
const typeSubtypeMap = computed(() => {
  const map = new Map<string, Set<string>>();

  Object.entries(defaultTypeSubtypes).forEach(([type, subtypes]) => {
    map.set(type, new Set(subtypes));
  });

  store.partitions.forEach(partition => {
    const type = partition.type.trim();
    if (!type) {
      return;
    }
    if (!map.has(type)) {
      map.set(type, new Set());
    }
    const subtype = (partition.subtype ?? '').trim();
    if (subtype) {
      map.get(type)?.add(subtype);
    }
  });

  const draftType = store.draft?.type?.trim();
  if (draftType) {
    if (!map.has(draftType)) {
      map.set(draftType, new Set());
    }
    const draftSubtype = (store.draft?.subtype ?? '').trim();
    if (draftSubtype) {
      map.get(draftType)?.add(draftSubtype);
    }
  }

  return map;
});
const editTypeOptions = computed(() => uniqueSorted([...typeSubtypeMap.value.keys()]));
const editSubtypeOptions = computed(() => {
  const type = store.draft?.type?.trim() ?? '';
  if (!type) {
    return [];
  }
  const subtypes = typeSubtypeMap.value.get(type);
  return uniqueSorted([...(subtypes ?? [])]);
});
const editRegionOptions = computed(() =>
  uniqueSorted([
    ...store.regions.map(region => region.name),
    ...store.partitions.map(partition => partition.region),
    ...store.partitions.map(partition => partition.exec?.region ?? ''),
    store.draft?.region ?? '',
    store.draft?.execRegion ?? '',
  ])
);
const editCoreOptions = computed(() =>
  uniqueSorted(['HCPU', 'LCPU', 'ACPU', ...coreOptions.value, store.draft?.core ?? ''])
);

const filteredPartitions = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return store.partitions.filter(partition => {
    if (needle && !matchesQuery(partition, needle)) {
      return false;
    }
    if (regionFilter.value && partition.region !== regionFilter.value) {
      return false;
    }
    if (typeFilter.value && partition.type !== typeFilter.value) {
      return false;
    }
    if (coreFilter.value && partition.core !== coreFilter.value) {
      return false;
    }
    return true;
  });
});

const targetDescription = computed(() => {
  const target = store.selectedTarget;
  if (!target) {
    return t('ptab.editor.noTarget');
  }
  if (!target.editable && target.reason) {
    return target.reason;
  }
  return target.exists ? t('ptab.editor.targetExists') : t('ptab.editor.targetNew');
});

const layoutChartOption = computed<ChartOption>(() => buildLayoutChartOption());

onMounted(() => {
  restorePanePrefs();
  store.fetchSnapshot();
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeLayout(layout: Partial<PaneLayout>): PaneLayout {
  const main = clamp(layout.main ?? defaultPaneLayout.main, 45, 80);
  const editor = 100 - main;
  const chart = clamp(layout.chart ?? defaultPaneLayout.chart, 28, 78);
  const table = 100 - chart;

  return {
    main,
    editor,
    chart,
    table,
  };
}

function restorePanePrefs() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const rawValue = window.localStorage.getItem(panePrefsStorageKey);
    if (!rawValue) {
      return;
    }
    const parsed = JSON.parse(rawValue) as Partial<PaneLayout>;
    paneLayout.value = normalizeLayout(parsed);
  } catch {
    // Ignore invalid saved layout preferences.
  }
}

function savePanePrefs() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(panePrefsStorageKey, JSON.stringify(paneLayout.value));
}

function handleWorkspaceResized(payload: SplitpanesResizedPayload) {
  const main = payload.panes?.[0]?.size;
  const editor = payload.panes?.[1]?.size;
  if (typeof main !== 'number' || typeof editor !== 'number') {
    return;
  }

  paneLayout.value = normalizeLayout({
    ...paneLayout.value,
    main,
    editor,
  });
  savePanePrefs();
}

function handleMainResized(payload: SplitpanesResizedPayload) {
  const chart = payload.panes?.[0]?.size;
  const table = payload.panes?.[1]?.size;
  if (typeof chart !== 'number' || typeof table !== 'number') {
    return;
  }

  paneLayout.value = normalizeLayout({
    ...paneLayout.value,
    chart,
    table,
  });
  savePanePrefs();
}

function matchesQuery(partition: PtabPartition, needle: string): boolean {
  return [
    partition.name,
    partition.type,
    partition.subtype ?? '',
    partition.region,
    partition.core ?? '',
    partition.source ?? '',
  ].some(value => value.toLowerCase().includes(needle));
}

function clearFilters() {
  query.value = '';
  regionFilter.value = '';
  typeFilter.value = '';
  coreFilter.value = '';
}

function handleTypeChange(type: string) {
  const subtypes = typeSubtypeMap.value.get(type);
  const currentSubtype = (store.draft?.subtype ?? '').trim();
  const nextSubtype =
    currentSubtype && subtypes?.has(currentSubtype) ? currentSubtype : (uniqueSorted([...(subtypes ?? [])])[0] ?? '');

  store.updateDraft({
    type,
    subtype: nextSubtype,
  });
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function sourceLabel(source: PtabPartition['source']): string {
  switch (source) {
    case 'project':
      return t('ptab.sources.project');
    case 'chip_overlay':
      return t('ptab.sources.chipOverlay');
    case 'board_overlay':
      return t('ptab.sources.boardOverlay');
    case 'generated':
      return t('ptab.sources.generated');
    case 'base':
      return t('ptab.sources.base');
    default:
      return '-';
  }
}

function compactPath(filePath?: string | null): string {
  if (!filePath) {
    return t('common.notAvailable');
  }
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 3) {
    return filePath;
  }
  return `.../${parts.slice(-3).join('/')}`;
}

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KiB`;
  }
  return `${value} B`;
}

function formatHex(value: number): string {
  return `0x${Number(value).toString(16).toUpperCase()}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-';
  }
  return `${value.toFixed(1)}%`;
}

function percent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return (value / total) * 100;
}

function entryColor(entry: PtabUsageEntry): string {
  if (entry.kind === 'exec') {
    return '#f7b955';
  }
  if (entry.type === 'app') {
    return '#4f8cff';
  }
  if (entry.type === 'data' && entry.subtype === 'filesystem') {
    return '#35c2a1';
  }
  if (entry.type === 'data' && entry.subtype === 'flashdb_kv') {
    return '#a0c95a';
  }
  if (entry.type === 'bootloader' || entry.type === 'ftab') {
    return '#ef6f6c';
  }
  return '#8a8f98';
}

function sourceAccentColor(source: PtabPartition['source']): string {
  switch (source) {
    case 'project':
      return '#b88cff';
    case 'chip_overlay':
      return '#f7b955';
    case 'board_overlay':
      return '#6fc3df';
    case 'generated':
      return '#8a8f98';
    default:
      return 'transparent';
  }
}

function kindLabel(kind: LayoutItemKind): string {
  switch (kind) {
    case 'track':
      return t('ptab.layout.region');
    case 'exec':
      return t('ptab.layout.exec');
    case 'gap':
      return t('ptab.layout.gap');
    case 'overlap':
      return t('ptab.layout.overlap');
    default:
      return t('ptab.layout.storage');
  }
}

function sourceForPartitionName(name: string): PtabPartition['source'] {
  const normalized = name.trim().toLowerCase();
  return snapshot.value?.partitions.find(partition => partition.name.trim().toLowerCase() === normalized)?.source;
}

function buildRegionCapacityMap(currentSnapshot: {
  regions: PtabRegionUsage[];
  usageEntries: PtabUsageEntry[];
  gaps: PtabGap[];
  overlaps: PtabOverlap[];
}): Map<string, number> {
  const capacities = new Map<string, number>();

  for (const region of currentSnapshot.regions) {
    capacities.set(region.name, Math.max(region.total_bytes ?? 0, 1));
  }

  const recordEnd = (region: string, endOffset: number) => {
    if (!region || !Number.isFinite(endOffset)) {
      return;
    }
    capacities.set(region, Math.max(capacities.get(region) ?? 1, endOffset, 1));
  };

  currentSnapshot.usageEntries.forEach(entry => recordEnd(entry.region, entry.end_offset));
  currentSnapshot.gaps.forEach(gap => recordEnd(gap.region, gap.end_offset));
  currentSnapshot.overlaps.forEach(overlap => recordEnd(overlap.region, overlap.end_offset));

  return capacities;
}

function createRangeDatum(input: {
  categories: string[];
  region: string;
  offset: number;
  endOffset: number;
  sizeBytes: number;
  capacityBytes: number;
  name: string;
  kind: LayoutItemKind;
  type: string;
  subtype?: string;
  color: string;
  source?: PtabPartition['source'];
  memoryType?: string;
  usedBytes?: number;
  freeBytes?: number | null;
  usagePercent?: number | null;
}): LayoutDatum | null {
  const categoryIndex = input.categories.indexOf(input.region);
  if (
    categoryIndex < 0 ||
    !Number.isFinite(input.offset) ||
    !Number.isFinite(input.endOffset) ||
    input.endOffset <= input.offset
  ) {
    return null;
  }
  const capacityBytes = Math.max(input.capacityBytes, input.endOffset, 1);
  const startPercent = Math.max(0, Math.min(100, percent(input.offset, capacityBytes)));
  const endPercent = Math.max(startPercent, Math.min(100, percent(input.endOffset, capacityBytes)));

  return {
    value: [categoryIndex, startPercent, endPercent],
    name: input.name,
    kind: input.kind,
    type: input.type,
    subtype: input.subtype ?? '',
    region: input.region,
    offset: input.offset,
    endOffset: input.endOffset,
    sizeBytes: input.sizeBytes,
    capacityBytes,
    color: input.color,
    memoryType: input.memoryType,
    usedBytes: input.usedBytes,
    freeBytes: input.freeBytes,
    usagePercent: input.usagePercent,
    source: input.source,
  };
}

function trackDatum(categories: string[], region: PtabRegionUsage, capacityBytes: number): LayoutDatum | null {
  return createRangeDatum({
    categories,
    region: region.name,
    offset: 0,
    endOffset: capacityBytes,
    sizeBytes: capacityBytes,
    capacityBytes,
    name: region.name,
    kind: 'track',
    type: region.memory_type || t('common.notAvailable'),
    color: 'rgba(128,128,128,0.1)',
    memoryType: region.memory_type,
    usedBytes: region.used_bytes,
    freeBytes: region.free_bytes,
    usagePercent: region.usage_percent,
  });
}

function gapDatum(categories: string[], capacityByRegion: Map<string, number>, gap: PtabGap): LayoutDatum | null {
  return createRangeDatum({
    categories,
    region: gap.region,
    offset: gap.offset,
    endOffset: gap.end_offset,
    sizeBytes: gap.size_bytes,
    capacityBytes: capacityByRegion.get(gap.region) ?? gap.end_offset,
    name: t('ptab.layout.gap'),
    kind: 'gap',
    type: t('ptab.layout.free'),
    color: 'rgba(128,128,128,0.14)',
  });
}

function overlapDatum(
  categories: string[],
  capacityByRegion: Map<string, number>,
  overlap: PtabOverlap
): LayoutDatum | null {
  return createRangeDatum({
    categories,
    region: overlap.region,
    offset: overlap.offset,
    endOffset: overlap.end_offset,
    sizeBytes: overlap.size_bytes,
    capacityBytes: capacityByRegion.get(overlap.region) ?? overlap.end_offset,
    name: overlap.entries.join(', '),
    kind: 'overlap',
    type: t('ptab.layout.overlap'),
    subtype: overlap.kinds.join(', '),
    color: '#ff6b6b',
  });
}

function usageDatum(
  categories: string[],
  capacityByRegion: Map<string, number>,
  entry: PtabUsageEntry
): LayoutDatum | null {
  return createRangeDatum({
    categories,
    region: entry.region,
    offset: entry.offset,
    endOffset: entry.end_offset,
    sizeBytes: entry.size_bytes,
    capacityBytes: capacityByRegion.get(entry.region) ?? entry.end_offset,
    name: entry.name,
    kind: entry.kind,
    type: entry.type,
    subtype: entry.subtype ?? '',
    color: entryColor(entry),
    source: sourceForPartitionName(entry.name),
    memoryType: entry.memory_type,
  });
}

function formatLayoutTooltip(params: unknown): string {
  const datum = getLayoutDatum(params);
  if (!datum) {
    return '';
  }

  if (datum.kind === 'track') {
    return [
      `<strong>${escapeHtml(datum.name)}</strong>`,
      `${escapeHtml(t('ptab.layout.memoryType'))}: ${escapeHtml(datum.memoryType || '-')}`,
      `${escapeHtml(t('ptab.layout.capacity'))}: ${formatBytes(datum.capacityBytes)}`,
      `${escapeHtml(t('ptab.layout.used'))}: ${formatBytes(datum.usedBytes ?? 0)} (${formatPercent(datum.usagePercent)})`,
      `${escapeHtml(t('ptab.layout.free'))}: ${formatBytes(datum.freeBytes)}`,
    ].join('<br/>');
  }

  const lines = [
    `<strong>${escapeHtml(datum.name)}</strong>`,
    `${escapeHtml(t('ptab.table.region'))}: ${escapeHtml(datum.region)}`,
    `${escapeHtml(t('ptab.layout.kind'))}: ${escapeHtml(kindLabel(datum.kind))}`,
    `${escapeHtml(t('ptab.table.type'))}: ${escapeHtml(datum.type)}${datum.subtype ? `/${escapeHtml(datum.subtype)}` : ''}`,
    `${escapeHtml(t('ptab.table.offset'))}: ${formatHex(datum.offset)}`,
    `${escapeHtml(t('ptab.layout.end'))}: ${formatHex(datum.endOffset)}`,
    `${escapeHtml(t('ptab.table.size'))}: ${formatBytes(datum.sizeBytes)}`,
  ];

  if (datum.source) {
    lines.push(`${escapeHtml(t('ptab.table.source'))}: ${escapeHtml(sourceLabel(datum.source))}`);
  }

  return lines.join('<br/>');
}

function getLayoutDatum(params: unknown): LayoutDatum | null {
  const item = Array.isArray(params) ? params[0] : params;
  if (!isRecord(item) || !isRecord(item.data)) {
    return null;
  }
  const data = item.data;
  if (
    !Array.isArray(data.value) ||
    typeof data.name !== 'string' ||
    typeof data.kind !== 'string' ||
    typeof data.region !== 'string'
  ) {
    return null;
  }
  return data as unknown as LayoutDatum;
}

function renderLayoutItem(params: LayoutRenderParams, api: LayoutRenderApi, selectedName: string) {
  const datum = params.data;
  if (!datum) {
    return null;
  }

  const categoryIndex = Number(api.value(0));
  const startPercent = Number(api.value(1));
  const endPercent = Number(api.value(2));
  const startCoord = api.coord([startPercent, categoryIndex]);
  const endCoord = api.coord([endPercent, categoryIndex]);
  const laneHeight = api.size([0, 1])[1];
  const trackHeight = Math.min(30, Math.max(18, laneHeight * 0.46));
  const storageHeight = Math.min(22, Math.max(13, laneHeight * 0.34));
  const execHeight = 5;
  const overlapHeight = Math.min(34, trackHeight + 8);
  const coordSys = params.coordSys;
  const rect = {
    x: startCoord[0],
    y: startCoord[1] - trackHeight / 2,
    width: Math.max(endCoord[0] - startCoord[0], datum.kind === 'track' ? 1 : 3),
    height: trackHeight,
  };

  if (datum.kind === 'storage') {
    rect.y = startCoord[1] - storageHeight / 2 - 1;
    rect.height = storageHeight;
  } else if (datum.kind === 'exec') {
    rect.y = startCoord[1] + trackHeight / 2 + 5;
    rect.height = execHeight;
  } else if (datum.kind === 'overlap') {
    rect.y = startCoord[1] - overlapHeight / 2;
    rect.height = overlapHeight;
  }

  const shape = graphic.clipRectByRect(rect, {
    x: Number(coordSys?.x ?? 0),
    y: Number(coordSys?.y ?? 0),
    width: Number(coordSys?.width ?? 0),
    height: Number(coordSys?.height ?? 0),
  });

  if (!shape) {
    return null;
  }

  const isSelected = selectedName && datum.name === selectedName && (datum.kind === 'storage' || datum.kind === 'exec');
  const stroke =
    datum.kind === 'overlap'
      ? '#ff6b6b'
      : isSelected
        ? 'rgba(255,255,255,0.92)'
        : datum.kind === 'gap'
          ? 'rgba(180,180,180,0.36)'
          : datum.kind === 'track'
            ? 'rgba(150,150,150,0.28)'
            : 'rgba(255,255,255,0.22)';
  const fill =
    datum.kind === 'track'
      ? 'rgba(127,127,127,0.08)'
      : datum.kind === 'gap'
        ? 'rgba(127,127,127,0.12)'
        : datum.kind === 'overlap'
          ? 'rgba(255,107,107,0.24)'
          : datum.color;
  const children: Array<Record<string, unknown>> = [
    {
      type: 'rect',
      shape,
      style: api.style({
        fill,
        stroke,
        lineWidth: isSelected || datum.kind === 'overlap' ? 2 : 1,
        lineDash: datum.kind === 'gap' ? [4, 4] : datum.kind === 'overlap' ? [3, 2] : undefined,
        opacity: datum.kind === 'exec' ? 0.95 : 1,
      }),
      z2: zLevelForKind(datum.kind),
    },
  ];

  const accentColor = sourceAccentColor(datum.source);
  if (accentColor !== 'transparent' && (datum.kind === 'storage' || datum.kind === 'exec') && shape.width >= 8) {
    children.push({
      type: 'rect',
      shape: {
        x: shape.x,
        y: shape.y,
        width: Math.min(4, shape.width),
        height: shape.height,
      },
      style: {
        fill: accentColor,
        opacity: 0.95,
      },
      z2: zLevelForKind(datum.kind) + 1,
    });
  }

  if (datum.kind === 'storage' && shape.width > 88) {
    children.push({
      type: 'text',
      style: {
        x: shape.x + 8,
        y: shape.y + shape.height / 2,
        text: datum.name,
        fill: '#ffffff',
        opacity: 0.9,
        fontSize: 11,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontWeight: 600,
        textVerticalAlign: 'middle',
        width: Math.max(0, shape.width - 16),
        overflow: 'truncate',
      },
      z2: zLevelForKind(datum.kind) + 2,
    });
  }

  return {
    type: 'group',
    children,
  };
}

function zLevelForKind(kind: LayoutItemKind): number {
  switch (kind) {
    case 'track':
      return 1;
    case 'gap':
      return 2;
    case 'storage':
      return 4;
    case 'exec':
      return 5;
    case 'overlap':
      return 8;
    default:
      return 1;
  }
}

function buildLayoutChartOption(): ChartOption {
  const currentSnapshot = snapshot.value;
  if (!currentSnapshot) {
    return {};
  }
  const categories = currentSnapshot.regions.map(region => region.name);
  const capacityByRegion = buildRegionCapacityMap(currentSnapshot);
  const data = [
    ...currentSnapshot.regions.map(region => trackDatum(categories, region, capacityByRegion.get(region.name) ?? 1)),
    ...currentSnapshot.gaps.map(gap => gapDatum(categories, capacityByRegion, gap)),
    ...currentSnapshot.usageEntries
      .filter(entry => entry.kind === 'storage')
      .map(entry => usageDatum(categories, capacityByRegion, entry)),
    ...currentSnapshot.usageEntries
      .filter(entry => entry.kind === 'exec')
      .map(entry => usageDatum(categories, capacityByRegion, entry)),
    ...currentSnapshot.overlaps.map(overlap => overlapDatum(categories, capacityByRegion, overlap)),
  ].filter((datum): datum is LayoutDatum => !!datum);
  const regionMeta = new Map(currentSnapshot.regions.map(region => [region.name, region]));
  const selectedName = store.selectedPartitionName;

  return {
    animation: {
      duration: 160,
      easing: 'cubicOut',
    },
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      confine: true,
      backgroundColor: readCssVariable('--vscode-editorWidget-background', '#252526'),
      borderColor: readCssVariable('--vscode-panel-border', '#3c3c3c'),
      textStyle: {
        color: readCssVariable('--vscode-foreground', '#d4d4d4'),
      },
      formatter: formatLayoutTooltip,
    },
    grid: { left: 126, right: 26, top: 16, bottom: 30 },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: 'var(--vscode-input-placeholder)',
        fontSize: 11,
        formatter(value: number) {
          return `${Number(value).toFixed(0)}%`;
        },
      },
      splitLine: { lineStyle: { color: 'rgba(128,128,128,0.13)' } },
    },
    yAxis: {
      type: 'category',
      data: categories,
      inverse: true,
      axisLine: { show: false },
      axisLabel: {
        color: 'var(--vscode-foreground)',
        fontSize: 11,
        lineHeight: 15,
        formatter(value: string) {
          const region = regionMeta.get(value);
          const capacityBytes = capacityByRegion.get(value) ?? region?.total_bytes ?? 0;
          const used = region?.used_bytes ?? 0;
          return `{name|${value}}\n{meta|${formatBytes(used)} / ${formatBytes(capacityBytes)}}`;
        },
        rich: {
          name: {
            color: 'var(--vscode-foreground)',
            fontWeight: 600,
          },
          meta: {
            color: 'var(--vscode-input-placeholder)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 10,
          },
        },
      },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'custom',
        encode: { x: [1, 2], y: 0, tooltip: [1, 2] },
        data,
        renderItem(params: unknown, api: LayoutRenderApi) {
          const renderParams = params as LayoutRenderParams;
          renderParams.data = renderParams.data ?? data[Number(renderParams.dataIndex)];
          return renderLayoutItem(renderParams, api, selectedName);
        },
      },
    ],
  };
}

function handleLayoutClick(params: unknown) {
  const datum = getLayoutDatum(params);
  if (!datum || datum.kind === 'track' || datum.kind === 'gap' || datum.kind === 'overlap') {
    return;
  }
  store.selectPartition(datum.name);
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

function readCssVariable(name: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
</script>

<style scoped>
.ptab-workspace {
  min-height: 0;
  flex: 1 1 0%;
  overflow: hidden;
}

.ptab-main {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.ptab-main-splitter {
  height: 100%;
}

.ptab-chart-pane {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.ptab-chart-body {
  display: flex;
  min-height: 0;
  flex: 1 1 0%;
  flex-direction: column;
}

.ptab-workspace :deep(.splitpanes__pane) {
  min-width: 0;
  min-height: 0;
}

.ptab-workspace :deep(.splitpanes__splitter) {
  position: relative;
  z-index: 3;
  flex-shrink: 0;
  background: transparent;
  outline: none;
}

.ptab-workspace :deep(.splitpanes__splitter)::before {
  content: '';
  position: absolute;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vscode-panel-border) 72%, transparent);
  transition:
    background 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;
}

.ptab-workspace :deep(.splitpanes__splitter:hover)::before,
.ptab-workspace :deep(.splitpanes__splitter:focus-visible)::before {
  background: color-mix(in srgb, var(--vscode-focusBorder) 72%, var(--vscode-panel-border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--vscode-focusBorder) 48%, transparent);
}

.ptab-workspace.splitpanes--vertical > :deep(.splitpanes__splitter) {
  min-width: 0.75rem;
}

.ptab-workspace.splitpanes--vertical > :deep(.splitpanes__splitter)::before {
  top: 0;
  bottom: 0;
  left: calc(50% - 1px);
  width: 2px;
}

.ptab-workspace.splitpanes--vertical > :deep(.splitpanes__splitter:hover)::before,
.ptab-workspace.splitpanes--vertical > :deep(.splitpanes__splitter:focus-visible)::before {
  transform: scaleX(1.8);
}

.ptab-main-splitter.splitpanes--horizontal > :deep(.splitpanes__splitter) {
  min-height: 0.75rem;
}

.ptab-main-splitter.splitpanes--horizontal > :deep(.splitpanes__splitter)::before {
  top: calc(50% - 1px);
  right: 0;
  left: 0;
  height: 2px;
}

.ptab-main-splitter.splitpanes--horizontal > :deep(.splitpanes__splitter:hover)::before,
.ptab-main-splitter.splitpanes--horizontal > :deep(.splitpanes__splitter:focus-visible)::before {
  transform: scaleY(1.8);
}

.summary-tile {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 82%, transparent);
  background: color-mix(in srgb, var(--vscode-input-background) 38%, transparent);
  padding: 0.65rem 0.75rem;
}

.summary-tile span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vscode-input-placeholder);
  font-size: 0.75rem;
}

.summary-tile strong {
  font-size: 1.1rem;
}

.layout-chart-shell {
  min-height: 0;
  flex: 1 1 0%;
  border-top: 1px solid color-mix(in srgb, var(--vscode-panel-border) 62%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--vscode-input-background) 28%, transparent),
    color-mix(in srgb, var(--vscode-background) 84%, transparent)
  );
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
}

.legend-swatch {
  display: inline-block;
  height: 0.6rem;
  width: 0.9rem;
  border: 1px solid color-mix(in srgb, var(--vscode-foreground) 22%, transparent);
  border-radius: 2px;
}

.legend-swatch--storage {
  background: linear-gradient(90deg, #4f8cff, #35c2a1);
}

.legend-swatch--exec {
  height: 0.28rem;
  background: #f7b955;
}

.legend-swatch--gap {
  border-color: color-mix(in srgb, var(--vscode-input-placeholder) 58%, transparent);
  background:
    repeating-linear-gradient(
      90deg,
      color-mix(in srgb, var(--vscode-input-placeholder) 32%, transparent) 0,
      color-mix(in srgb, var(--vscode-input-placeholder) 32%, transparent) 4px,
      transparent 4px,
      transparent 8px
    ),
    color-mix(in srgb, var(--vscode-input-background) 40%, transparent);
}

.legend-swatch--overlap {
  border-color: #ff6b6b;
  background: repeating-linear-gradient(
    135deg,
    rgba(255, 107, 107, 0.72) 0,
    rgba(255, 107, 107, 0.72) 3px,
    rgba(255, 107, 107, 0.18) 3px,
    rgba(255, 107, 107, 0.18) 6px
  );
}

.ptab-input {
  height: 2rem;
  min-width: 0;
  border: 1px solid var(--vscode-input-border);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  padding: 0 0.5rem;
  outline: none;
}

.measurement-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4.5rem;
  min-width: 0;
}

.measurement-control--wide {
  grid-template-columns: minmax(0, 1fr) 6rem;
}

.measurement-control__value {
  border-right-width: 0;
}

.measurement-control__unit {
  padding-left: 0.35rem;
  padding-right: 0.25rem;
  border-left-color: color-mix(in srgb, var(--vscode-input-border) 62%, transparent);
  color: var(--vscode-input-placeholder);
}

.ptab-textarea {
  min-height: 4.5rem;
  width: 100%;
  resize: vertical;
  border: 1px solid var(--vscode-input-border);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  padding: 0.5rem;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.75rem;
  outline: none;
}
</style>
