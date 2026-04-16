<template>
  <section class="space-y-6">
    <!-- Header -->
    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">
            {{ t('debugSnapshot.sectionLabel') }}
          </p>
          <h2 class="mt-3 text-3xl font-semibold tracking-tight">{{ t('debugSnapshot.title') }}</h2>
          <p class="mt-2 max-w-3xl text-sm text-vscode-input-placeholder">
            {{ t('debugSnapshot.subtitle') }}
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          <BaseButton variant="secondary" size="sm" @click="store.fetchBootstrap()">
            {{ t('debugSnapshot.actions.refresh') }}
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="flex items-center justify-center py-12">
      <span class="text-sm text-vscode-input-placeholder">{{ t('common.loading') }}</span>
    </div>

    <!-- Session Status -->
    <template v-else-if="store.bootstrap">
      <!-- Warnings / Not exportable -->
      <div
        v-if="!store.bootstrap.session.canExport"
        class="rounded-2xl border border-amber-500/25 bg-amber-500/8 px-5 py-4"
      >
        <p class="text-sm font-medium text-amber-100">{{ t('debugSnapshot.session.notExportable') }}</p>
        <ul v-if="store.bootstrap.warnings.length" class="mt-2 space-y-1">
          <li v-for="(w, i) in store.bootstrap.warnings" :key="i" class="text-xs text-amber-200/80">
            {{ w }}
          </li>
        </ul>
      </div>

      <!-- Session info card -->
      <div class="rounded-2xl border border-vscode-panel-border bg-vscode-background px-6 py-5 shadow-sm">
        <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
          {{ t('debugSnapshot.session.label') }}
        </p>
        <div class="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <p class="text-xs text-vscode-input-placeholder">{{ t('debugSnapshot.session.name') }}</p>
            <p class="mt-1 text-sm font-medium">
              {{ store.bootstrap.session.sessionName ?? t('debugSnapshot.session.noSession') }}
            </p>
          </div>
          <div>
            <p class="text-xs text-vscode-input-placeholder">{{ t('debugSnapshot.session.state') }}</p>
            <p class="mt-1 text-sm">
              <span :class="executionStateBadgeClass">
                {{ t(`debugSnapshot.session.executionState.${store.bootstrap.session.executionState}`) }}
              </span>
            </p>
          </div>
          <div>
            <p class="text-xs text-vscode-input-placeholder">{{ t('debugSnapshot.session.canExport') }}</p>
            <p class="mt-1 text-sm">
              <span :class="store.bootstrap.session.canExport ? 'text-emerald-400' : 'text-red-400'">
                {{ store.bootstrap.session.canExport ? t('common.yes') : t('common.no') }}
              </span>
            </p>
          </div>
        </div>
      </div>

      <!-- Chip selection -->
      <div
        v-if="store.bootstrap.session.canExport"
        class="rounded-2xl border border-vscode-panel-border bg-vscode-background px-6 py-5 shadow-sm"
      >
        <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
          {{ t('debugSnapshot.chip.label') }}
        </p>
        <div class="mt-3">
          <select
            v-model="selectedPartNumber"
            class="select select-bordered w-full max-w-md bg-vscode-input-background text-vscode-foreground"
            :disabled="store.isTaskRunning"
          >
            <option value="" disabled>{{ t('debugSnapshot.chip.placeholder') }}</option>
            <optgroup v-for="group in chipGroups" :key="group.modelId" :label="group.modelId">
              <option v-for="chip in group.chips" :key="chip.partNumber" :value="chip.partNumber">
                {{ chip.partNumber }}{{ chip.description ? ` — ${chip.description}` : '' }} ({{ chip.psramSummary }})
              </option>
            </optgroup>
          </select>
        </div>
      </div>

      <!-- Plan loading -->
      <div v-if="store.planLoading" class="flex items-center justify-center py-8">
        <span class="text-sm text-vscode-input-placeholder">{{ t('debugSnapshot.plan.loading') }}</span>
      </div>

      <!-- Plan: items table -->
      <div
        v-if="store.plan"
        class="rounded-2xl border border-vscode-panel-border bg-vscode-background px-6 py-5 shadow-sm"
      >
        <div class="flex items-center justify-between">
          <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
            {{ t('debugSnapshot.plan.label') }}
          </p>
          <div class="flex gap-2">
            <button
              class="text-xs text-vscode-button-background hover:underline"
              :disabled="store.isTaskRunning"
              @click="store.selectAll()"
            >
              {{ t('debugSnapshot.plan.selectAll') }}
            </button>
            <span class="text-xs text-vscode-input-placeholder">|</span>
            <button
              class="text-xs text-vscode-button-background hover:underline"
              :disabled="store.isTaskRunning"
              @click="store.deselectAll()"
            >
              {{ t('debugSnapshot.plan.deselectAll') }}
            </button>
          </div>
        </div>

        <!-- Plan warnings -->
        <div
          v-if="store.plan.warnings.length"
          class="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3"
        >
          <p v-for="(w, i) in store.plan.warnings" :key="i" class="text-xs text-amber-200/80">{{ w }}</p>
        </div>

        <!-- Items by source group -->
        <div v-for="group in itemGroups" :key="group.source" class="mt-4">
          <p class="mb-2 text-xs font-medium text-vscode-input-placeholder">
            {{ t(`debugSnapshot.source.${group.source}`) }}
            <span class="ml-1 opacity-60">({{ group.items.length }})</span>
          </p>
          <div class="overflow-x-auto">
            <table class="table table-xs w-full">
              <thead>
                <tr class="text-xs text-vscode-input-placeholder">
                  <th class="w-8"></th>
                  <th>{{ t('debugSnapshot.table.name') }}</th>
                  <th>{{ t('debugSnapshot.table.kind') }}</th>
                  <th>{{ t('debugSnapshot.table.address') }}</th>
                  <th>{{ t('debugSnapshot.table.size') }}</th>
                  <th>{{ t('debugSnapshot.table.fileName') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in group.items" :key="item.id" class="hover">
                  <td>
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs"
                      :checked="store.selectedItemIds.has(item.id)"
                      :disabled="store.isTaskRunning"
                      @change="store.toggleItem(item.id)"
                    />
                  </td>
                  <td class="font-mono text-xs">{{ item.name }}</td>
                  <td>
                    <span class="badge badge-xs" :class="item.kind === 'memoryRegion' ? 'badge-info' : 'badge-accent'">
                      {{ item.kind === 'memoryRegion' ? 'MEM' : 'REG' }}
                    </span>
                  </td>
                  <td class="font-mono text-xs">0x{{ item.address.toString(16).toUpperCase().padStart(8, '0') }}</td>
                  <td class="text-xs">{{ formatSize(item.size) }}</td>
                  <td class="font-mono text-xs opacity-70">{{ item.fileName }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p class="mt-3 text-xs text-vscode-input-placeholder">
          {{
            t('debugSnapshot.plan.selectedCount', { count: store.selectedItemIds.size, total: store.plan.items.length })
          }}
        </p>
      </div>

      <!-- Output directory -->
      <div
        v-if="store.plan"
        class="rounded-2xl border border-vscode-panel-border bg-vscode-background px-6 py-5 shadow-sm"
      >
        <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
          {{ t('debugSnapshot.output.label') }}
        </p>
        <div class="mt-3 flex items-center gap-3">
          <input
            type="text"
            readonly
            class="input input-bordered input-sm flex-1 bg-vscode-input-background font-mono text-xs text-vscode-foreground"
            :value="store.outputRoot"
            :placeholder="t('debugSnapshot.output.placeholder')"
          />
          <BaseButton variant="secondary" size="sm" :disabled="store.isTaskRunning" @click="store.browseOutputRoot()">
            {{ t('common.browse') }}
          </BaseButton>
        </div>
      </div>

      <!-- Export action -->
      <div v-if="store.plan" class="flex items-center gap-4">
        <BaseButton
          variant="primary"
          :disabled="!store.canExport"
          :loading="store.isTaskRunning"
          @click="store.startExport()"
        >
          {{ store.isTaskRunning ? t('debugSnapshot.actions.exporting') : t('debugSnapshot.actions.startExport') }}
        </BaseButton>
        <BaseButton v-if="store.isTaskRunning" variant="warning" size="sm" @click="store.cancelExport()">
          {{ t('common.cancel') }}
        </BaseButton>
      </div>

      <!-- Task progress panel -->
      <div
        v-if="store.currentTask"
        class="rounded-2xl border border-vscode-panel-border bg-vscode-background px-6 py-5 shadow-sm"
      >
        <div class="flex items-center justify-between">
          <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
            {{ t('debugSnapshot.task.label') }}
          </p>
          <span :class="taskStatusBadgeClass">
            {{ t(`debugSnapshot.task.status.${store.currentTask.status}`) }}
          </span>
        </div>

        <!-- Progress bar -->
        <progress v-if="store.currentTask.status === 'running'" class="progress progress-info mt-3 w-full"></progress>

        <!-- Error -->
        <div v-if="store.currentTask.error" class="mt-3 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3">
          <p class="text-xs text-red-200">{{ store.currentTask.error }}</p>
        </div>

        <!-- Output directory -->
        <div v-if="store.currentTask.status === 'succeeded' && store.currentTask.outputDir" class="mt-3">
          <p class="text-xs text-vscode-input-placeholder">{{ t('debugSnapshot.task.outputDir') }}</p>
          <p class="mt-1 font-mono text-xs text-emerald-400">{{ store.currentTask.outputDir }}</p>
        </div>

        <!-- File results -->
        <div v-if="store.currentTask.files.length" class="mt-4">
          <p class="mb-2 text-xs font-medium text-vscode-input-placeholder">
            {{ t('debugSnapshot.task.files') }}
            <span class="ml-1 opacity-60">({{ store.currentTask.files.length }})</span>
          </p>
          <div class="overflow-x-auto max-h-48 overflow-y-auto">
            <table class="table table-xs w-full">
              <thead>
                <tr class="text-xs text-vscode-input-placeholder">
                  <th>{{ t('debugSnapshot.table.fileName') }}</th>
                  <th>{{ t('debugSnapshot.task.fileStatus') }}</th>
                  <th>{{ t('debugSnapshot.table.size') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="file in store.currentTask.files" :key="file.itemId">
                  <td class="font-mono text-xs">{{ file.fileName }}</td>
                  <td>
                    <span
                      class="badge badge-xs"
                      :class="{
                        'badge-success': file.status === 'written',
                        'badge-warning': file.status === 'skipped',
                        'badge-error': file.status === 'failed',
                      }"
                    >
                      {{ t(`debugSnapshot.task.fileStatusValue.${file.status}`) }}
                    </span>
                  </td>
                  <td class="text-xs">{{ file.size != null ? formatSize(file.size) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Logs -->
        <div v-if="store.currentTask.logs.length" class="mt-4">
          <p class="mb-2 text-xs font-medium text-vscode-input-placeholder">
            {{ t('debugSnapshot.task.logs') }}
            <span class="ml-1 opacity-60">({{ store.currentTask.logs.length }})</span>
          </p>
          <div
            ref="logContainer"
            class="max-h-64 overflow-y-auto rounded-xl border border-vscode-panel-border bg-vscode-input-background/40 px-3 py-2"
          >
            <p
              v-for="(log, i) in store.currentTask.logs"
              :key="i"
              class="font-mono text-xs leading-5"
              :class="{
                'text-red-400': log.level === 'error',
                'text-amber-400': log.level === 'warn',
                'text-vscode-foreground/70': log.level === 'info',
              }"
            >
              <span class="mr-2 opacity-40">{{ formatLogTime(log.ts) }}</span
              >{{ log.message }}
            </p>
          </div>
        </div>

        <!-- Clear task button -->
        <div v-if="store.currentTask.status !== 'running'" class="mt-4">
          <BaseButton variant="secondary" size="sm" @click="store.clearTask()">
            {{ t('debugSnapshot.task.clear') }}
          </BaseButton>
        </div>
      </div>

      <!-- Global error -->
      <div v-if="store.error" class="rounded-2xl border border-red-500/25 bg-red-500/8 px-5 py-4">
        <div class="flex items-center justify-between">
          <p class="text-sm text-red-200">{{ store.error }}</p>
          <button class="text-xs text-red-300 hover:underline" @click="store.clearError()">
            {{ t('debugSnapshot.actions.dismiss') }}
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/common/BaseButton.vue';
import { useDebugSnapshotStore } from '@/stores/debugSnapshot';
import type { DebugSnapshotCandidateItem, DebugSnapshotCandidateSource, DebugSnapshotChipOption } from '@/types';

const { t } = useI18n();
const store = useDebugSnapshotStore();

const selectedPartNumber = ref('');
const logContainer = ref<HTMLElement | null>(null);

// Group chip options by modelId
const chipGroups = computed(() => {
  if (!store.bootstrap) {
    return [];
  }
  const map = new Map<string, { modelId: string; chips: DebugSnapshotChipOption[] }>();
  for (const chip of store.bootstrap.chipOptions) {
    if (!map.has(chip.modelId)) {
      map.set(chip.modelId, { modelId: chip.modelId, chips: [] });
    }
    map.get(chip.modelId)!.chips.push(chip);
  }
  return [...map.values()];
});

// Group plan items by source
const sourceOrder: DebugSnapshotCandidateSource[] = ['baseTemplate', 'partTemplate', 'dynamicPsram', 'svdExtra'];

const itemGroups = computed(() => {
  if (!store.plan) {
    return [];
  }
  const map = new Map<DebugSnapshotCandidateSource, DebugSnapshotCandidateItem[]>();
  for (const item of store.plan.items) {
    if (!map.has(item.source)) {
      map.set(item.source, []);
    }
    map.get(item.source)!.push(item);
  }
  return sourceOrder.filter(source => map.has(source)).map(source => ({ source, items: map.get(source)! }));
});

const executionStateBadgeClass = computed(() => {
  const state = store.bootstrap?.session.executionState;
  if (state === 'stopped') {
    return 'badge badge-sm badge-success';
  }
  if (state === 'running') {
    return 'badge badge-sm badge-info';
  }
  return 'badge badge-sm badge-ghost';
});

const taskStatusBadgeClass = computed(() => {
  const status = store.currentTask?.status;
  switch (status) {
    case 'running':
      return 'badge badge-sm badge-info';
    case 'succeeded':
      return 'badge badge-sm badge-success';
    case 'failed':
      return 'badge badge-sm badge-error';
    case 'cancelled':
      return 'badge badge-sm badge-warning';
    default:
      return 'badge badge-sm badge-ghost';
  }
});

// Watch part number selection → build plan
watch(selectedPartNumber, value => {
  if (value) {
    store.buildPlan(value);
  }
});

// Auto-scroll logs
watch(
  () => store.currentTask?.logs.length,
  () => {
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight;
      }
    });
  }
);

onMounted(() => {
  store.fetchBootstrap();
});

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatLogTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}
</script>
