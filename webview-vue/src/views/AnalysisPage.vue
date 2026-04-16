<template>
  <section class="space-y-6">
    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">
            {{ t('analysis.sectionLabel') }}
          </p>
          <h2 class="mt-3 text-3xl font-semibold tracking-tight">{{ t('analysis.title') }}</h2>
          <p class="mt-2 max-w-3xl text-sm text-vscode-input-placeholder">
            {{ subtitle }}
          </p>
        </div>

        <div class="flex flex-wrap gap-3">
          <BaseButton variant="primary" @click="runAnalysis">{{ t('analysis.actions.run') }}</BaseButton>
          <BaseButton variant="secondary" @click="resetFilters">{{ t('analysis.actions.reset') }}</BaseButton>
        </div>
      </div>

      <div class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div class="rounded-2xl border border-red-500/25 bg-red-500/8 px-4 py-4">
          <p class="text-xs uppercase tracking-[0.22em] text-red-200/80">{{ t('analysis.summary.errors') }}</p>
          <p class="mt-3 text-3xl font-semibold text-red-100">{{ summary.errorCount }}</p>
        </div>
        <div class="rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-4">
          <p class="text-xs uppercase tracking-[0.22em] text-amber-100/80">{{ t('analysis.summary.warnings') }}</p>
          <p class="mt-3 text-3xl font-semibold text-amber-50">{{ summary.warningCount }}</p>
        </div>
        <div class="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-4">
          <p class="text-xs uppercase tracking-[0.22em] text-emerald-100/80">{{ t('analysis.summary.clean') }}</p>
          <p class="mt-3 text-3xl font-semibold text-emerald-50">{{ summary.cleanCount }}</p>
        </div>
        <div class="rounded-2xl border border-slate-400/25 bg-slate-500/8 px-4 py-4">
          <p class="text-xs uppercase tracking-[0.22em] text-slate-200/80">{{ t('analysis.summary.pending') }}</p>
          <p class="mt-3 text-3xl font-semibold text-slate-100">{{ summary.notAnalyzedCount }}</p>
        </div>
        <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/40 px-4 py-4">
          <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
            {{ t('analysis.summary.visibleScope') }}
          </p>
          <p class="mt-3 text-3xl font-semibold">{{ summary.visibleGroups }}</p>
          <p class="mt-2 text-xs text-vscode-input-placeholder">
            {{ t('analysis.summary.instances', { visible: summary.visibleInstances, total: summary.totalInstances }) }}
          </p>
        </div>
      </div>
    </div>

    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <div class="flex flex-col gap-5">
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
            {{ t('analysis.view.label') }}
          </span>
          <button
            class="rounded-full border px-4 py-2 text-sm transition-colors"
            :class="modeButtonClass(viewMode === 'peripheral')"
            @click="setViewMode('peripheral')"
          >
            {{ t('analysis.view.peripheral') }}
          </button>
          <button
            class="rounded-full border px-4 py-2 text-sm transition-colors"
            :class="modeButtonClass(viewMode === 'severity')"
            @click="setViewMode('severity')"
          >
            {{ t('analysis.view.severity') }}
          </button>
        </div>

        <div class="grid gap-4 xl:grid-cols-[220px_220px_1fr]">
          <div>
            <p class="mb-2 text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
              {{ t('analysis.filters.severity.label') }}
            </p>
            <BaseSelect v-model="severityFilter" :options="severityOptions" />
          </div>

          <div>
            <p class="mb-2 text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
              {{ t('analysis.filters.status.label') }}
            </p>
            <BaseSelect v-model="statusFilter" :options="statusOptions" />
          </div>

          <div>
            <p class="mb-2 text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
              {{ t('analysis.filters.groups.label') }}
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                class="rounded-full border px-3 py-2 text-sm transition-colors"
                :class="groupButtonClass(filters.groups.length === 0)"
                @click="selectAllGroups"
              >
                {{ t('analysis.filters.groups.all') }}
              </button>
              <button
                v-for="groupName in availableGroups"
                :key="groupName"
                class="rounded-full border px-3 py-2 text-sm transition-colors"
                :class="groupButtonClass(filters.groups.length === 0 || filters.groups.includes(groupName))"
                @click="toggleGroup(groupName)"
              >
                {{ groupName }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="!hasContent"
      class="rounded-[2rem] border border-dashed border-vscode-panel-border px-6 py-12 text-center text-vscode-input-placeholder"
    >
      {{ emptyMessage }}
    </div>

    <div v-else class="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
      <div class="space-y-4">
        <template v-if="viewMode === 'peripheral'">
          <article
            v-for="group in snapshot!.groups"
            :key="group.id"
            class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-5 py-5 shadow-sm"
          >
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
                  {{ t('analysis.group') }}
                </p>
                <h3 class="mt-2 text-2xl font-semibold tracking-tight">{{ group.groupName }}</h3>
              </div>
              <div class="flex flex-wrap gap-2">
                <span
                  class="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]"
                  :class="countChipClass('error')"
                >
                  E{{ group.errorCount }}
                </span>
                <span
                  class="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]"
                  :class="countChipClass('warning')"
                >
                  W{{ group.warningCount }}
                </span>
                <span
                  class="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]"
                  :class="countChipClass('clean')"
                >
                  OK{{ group.cleanCount }}
                </span>
              </div>
            </div>

            <div class="mt-4 space-y-3">
              <section
                v-for="instance in group.instances"
                :key="instance.id"
                class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4"
              >
                <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p class="text-lg font-semibold">{{ instance.peripheralName }}</p>
                    <p class="mt-1 text-sm text-vscode-input-placeholder">{{ instanceStatusLabel(instance.status) }}</p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <span
                      v-if="instance.errorCount > 0"
                      class="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]"
                      :class="countChipClass('error')"
                    >
                      E{{ instance.errorCount }}
                    </span>
                    <span
                      v-if="instance.warningCount > 0"
                      class="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]"
                      :class="countChipClass('warning')"
                    >
                      W{{ instance.warningCount }}
                    </span>
                    <span
                      v-if="instance.status === 'ok'"
                      class="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]"
                      :class="countChipClass('clean')"
                    >
                      OK
                    </span>
                    <span
                      v-if="instance.status === 'not-analyzed'"
                      class="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]"
                      :class="countChipClass('pending')"
                    >
                      Pending
                    </span>
                  </div>
                </div>

                <div v-if="instance.findings.length > 0" class="mt-4 space-y-2">
                  <button
                    v-for="finding in instance.findings"
                    :key="finding.id"
                    class="w-full rounded-2xl border px-4 py-3 text-left transition-colors"
                    :class="findingButtonClass(finding, selectedFindingId === finding.id)"
                    @click="selectFinding(finding.id)"
                  >
                    <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p class="font-medium">{{ severityLabel(finding.severity) }} {{ finding.message }}</p>
                        <p v-if="finding.relatedRegister" class="mt-1 text-xs text-vscode-input-placeholder">
                          {{ finding.relatedRegister }}
                        </p>
                      </div>
                      <span class="text-xs uppercase tracking-[0.18em] opacity-80">
                        {{ severityShortLabel(finding.severity) }}
                      </span>
                    </div>
                  </button>
                </div>
              </section>
            </div>
          </article>
        </template>

        <template v-else>
          <article
            v-for="bucket in snapshot!.buckets"
            :key="bucket.id"
            class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-5 py-5 shadow-sm"
          >
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">
                  {{ t('analysis.bucket') }}
                </p>
                <h3 class="mt-2 text-2xl font-semibold tracking-tight">{{ bucketLabel(bucket.id) }}</h3>
              </div>
              <div class="flex flex-wrap gap-2">
                <span
                  class="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]"
                  :class="bucketChipClass(bucket.id)"
                >
                  {{ bucketMetric(bucket) }}
                </span>
              </div>
            </div>

            <div class="mt-4 space-y-3">
              <section
                v-for="group in bucket.groups"
                :key="`${bucket.id}-${group.id}`"
                class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4"
              >
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm uppercase tracking-[0.18em] text-vscode-input-placeholder">
                      {{ t('analysis.group') }}
                    </p>
                    <p class="mt-1 text-lg font-semibold">{{ group.groupName }}</p>
                  </div>
                  <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">
                    {{ t('analysis.instancesCount', { count: group.instances.length }) }}
                  </p>
                </div>

                <div class="mt-4 space-y-3">
                  <div
                    v-for="instance in group.instances"
                    :key="`${bucket.id}-${instance.id}`"
                    class="rounded-2xl border border-vscode-panel-border bg-vscode-background/70 px-4 py-4"
                  >
                    <p class="text-sm font-semibold">{{ instance.peripheralName }}</p>
                    <div v-if="instance.findings.length > 0" class="mt-3 space-y-2">
                      <button
                        v-for="finding in instance.findings"
                        :key="finding.id"
                        class="w-full rounded-2xl border px-4 py-3 text-left transition-colors"
                        :class="findingButtonClass(finding, selectedFindingId === finding.id)"
                        @click="selectFinding(finding.id)"
                      >
                        <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p class="font-medium">{{ severityLabel(finding.severity) }} {{ finding.message }}</p>
                            <p v-if="finding.relatedRegister" class="mt-1 text-xs text-vscode-input-placeholder">
                              {{ finding.relatedRegister }}
                            </p>
                          </div>
                          <span class="text-xs uppercase tracking-[0.18em] opacity-80">
                            {{ severityShortLabel(finding.severity) }}
                          </span>
                        </div>
                      </button>
                    </div>
                    <p v-else class="mt-2 text-sm text-vscode-input-placeholder">
                      {{ instanceStatusLabel(instance.status) }}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </article>
        </template>
      </div>

      <aside
        class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-5 py-5 shadow-sm xl:sticky xl:top-6 xl:self-start"
      >
        <template v-if="selectedFinding">
          <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">{{ t('analysis.details') }}</p>
          <h3 class="mt-3 text-2xl font-semibold tracking-tight">
            {{ severityLabel(selectedFinding.severity) }} {{ selectedFinding.message }}
          </h3>

          <div class="mt-5 space-y-3">
            <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">
                {{ t('analysis.peripheral') }}
              </p>
              <p class="mt-2 text-sm">{{ selectedFinding.peripheralName }}</p>
            </div>
            <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">{{ t('analysis.group') }}</p>
              <p class="mt-2 text-sm">{{ selectedFinding.groupName }}</p>
            </div>
            <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">
                {{ t('analysis.register') }}
              </p>
              <p class="mt-2 break-all text-sm">{{ selectedFinding.relatedRegister || t('analysis.notAvailable') }}</p>
            </div>
          </div>

          <div
            v-if="selectedFinding.suggestion"
            class="mt-5 rounded-2xl border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4"
          >
            <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">
              {{ t('analysis.suggestion') }}
            </p>
            <p class="mt-3 whitespace-pre-wrap text-sm leading-6">{{ selectedFinding.suggestion }}</p>
          </div>

          <div
            v-else
            class="mt-5 rounded-2xl border border-dashed border-vscode-panel-border px-4 py-4 text-sm text-vscode-input-placeholder"
          >
            {{ t('analysis.noSuggestion') }}
          </div>
        </template>

        <template v-else>
          <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">{{ t('analysis.details') }}</p>
          <div
            class="mt-4 rounded-2xl border border-dashed border-vscode-panel-border px-4 py-8 text-sm text-vscode-input-placeholder"
          >
            {{ t('analysis.detailsPlaceholder') }}
          </div>
        </template>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/common/BaseButton.vue';
import BaseSelect from '@/components/common/BaseSelect.vue';
import { onMessage, postMessage } from '@/services/vscodeBridge';
import type {
  AnalysisBucketId,
  AnalysisBucketPresentation,
  AnalysisFilterState,
  AnalysisFindingPresentation,
  AnalysisPresentationSnapshot,
  AnalysisSeverity,
  AnalysisSeverityFilter,
  AnalysisStatusFilter,
  AnalysisViewMode,
} from '@/types';

const { t } = useI18n();
const snapshot = ref<AnalysisPresentationSnapshot | null>(null);
const selectedFindingId = ref<string | null>(null);
const disposers: Array<() => void> = [];

const fallbackFilters: AnalysisFilterState = {
  severity: 'all',
  status: 'all',
  groups: [],
};

const summary = computed(() => {
  return (
    snapshot.value?.summary ?? {
      totalGroups: 0,
      visibleGroups: 0,
      totalInstances: 0,
      visibleInstances: 0,
      errorCount: 0,
      warningCount: 0,
      issueCount: 0,
      cleanCount: 0,
      notAnalyzedCount: 0,
    }
  );
});

const filters = computed(() => snapshot.value?.filters ?? fallbackFilters);
const viewMode = computed(() => snapshot.value?.viewMode ?? 'peripheral');
const availableGroups = computed(() => snapshot.value?.availableGroups ?? []);
const hasContent = computed(() => {
  if (!snapshot.value?.hasActiveSession) {
    return false;
  }

  return snapshot.value.groups.length > 0 || snapshot.value.buckets.length > 0;
});

const subtitle = computed(() => {
  if (!snapshot.value?.hasActiveSession) {
    return t('analysis.subtitle.inactive');
  }

  const chipText = snapshot.value.chipModel
    ? t('analysis.subtitle.chipModel', { chipModel: snapshot.value.chipModel })
    : t('analysis.subtitle.currentChip');
  const deviceText = snapshot.value.deviceName
    ? t('analysis.subtitle.deviceName', { deviceName: snapshot.value.deviceName })
    : t('analysis.subtitle.currentDevice');
  return t('analysis.subtitle.active', { chipText, deviceText });
});

const emptyMessage = computed(() => {
  if (!snapshot.value?.hasActiveSession) {
    return t('analysis.empty.noSession');
  }

  return snapshot.value.message || t('analysis.empty.noResults');
});

const findingMap = computed(() => {
  const entries = new Map<string, AnalysisFindingPresentation>();
  const currentSnapshot = snapshot.value;
  if (!currentSnapshot) {
    return entries;
  }

  const groups =
    currentSnapshot.viewMode === 'peripheral'
      ? currentSnapshot.groups
      : currentSnapshot.buckets.flatMap(bucket => bucket.groups);

  groups.forEach(group => {
    group.instances.forEach(instance => {
      instance.findings.forEach(finding => {
        entries.set(finding.id, finding);
      });
    });
  });

  return entries;
});

const selectedFinding = computed(() => {
  if (!selectedFindingId.value) {
    return null;
  }

  return findingMap.value.get(selectedFindingId.value) ?? null;
});

const severityOptions = computed(() => [
  { value: 'all', label: t('analysis.filters.severity.all') },
  { value: 'error', label: t('analysis.filters.severity.error') },
  { value: 'warning', label: t('analysis.filters.severity.warning') },
]);

const statusOptions = computed(() => [
  { value: 'all', label: t('analysis.filters.status.all') },
  { value: 'issues', label: t('analysis.filters.status.issues') },
  { value: 'clean', label: t('analysis.filters.status.clean') },
]);

const severityFilter = computed<string>({
  get: () => filters.value.severity,
  set: (value: string) => {
    postMessage({
      command: 'updateAnalysisFilters',
      filters: {
        severity: value as AnalysisSeverityFilter,
      },
    });
  },
});

const statusFilter = computed<string>({
  get: () => filters.value.status,
  set: (value: string) => {
    postMessage({
      command: 'updateAnalysisFilters',
      filters: {
        status: value as AnalysisStatusFilter,
      },
    });
  },
});

watch(
  findingMap,
  currentMap => {
    if (selectedFindingId.value && currentMap.has(selectedFindingId.value)) {
      return;
    }

    const nextFinding = currentMap.values().next().value as AnalysisFindingPresentation | undefined;
    selectedFindingId.value = nextFinding?.id ?? null;
  },
  { immediate: true }
);

function selectFinding(findingId: string) {
  selectedFindingId.value = findingId;
}

function selectAllGroups() {
  postMessage({
    command: 'updateAnalysisFilters',
    filters: {
      groups: [],
    },
  });
}

function toggleGroup(groupName: string) {
  const currentGroups = filters.value.groups;
  let nextGroups: string[];
  if (currentGroups.length === 0) {
    nextGroups = [groupName];
  } else if (currentGroups.includes(groupName)) {
    nextGroups = currentGroups.filter(item => item !== groupName);
  } else {
    nextGroups = [...currentGroups, groupName].sort((left, right) => left.localeCompare(right));
  }

  postMessage({
    command: 'updateAnalysisFilters',
    filters: {
      groups: nextGroups,
    },
  });
}

function setViewMode(nextViewMode: AnalysisViewMode) {
  postMessage({
    command: 'setAnalysisViewMode',
    viewMode: nextViewMode,
  });
}

function runAnalysis() {
  postMessage({ command: 'runPeripheralAnalysis' });
}

function resetFilters() {
  postMessage({ command: 'resetAnalysisFilters' });
}

function modeButtonClass(active: boolean) {
  return active
    ? 'border-vscode-button-background bg-vscode-button-background/18 text-vscode-foreground'
    : 'border-vscode-panel-border bg-vscode-input-background/35 text-vscode-input-placeholder hover:text-vscode-foreground';
}

function groupButtonClass(active: boolean) {
  return active
    ? 'border-vscode-button-background bg-vscode-button-background/18 text-vscode-foreground'
    : 'border-vscode-panel-border bg-vscode-input-background/35 text-vscode-input-placeholder hover:text-vscode-foreground';
}

function countChipClass(kind: 'error' | 'warning' | 'clean' | 'pending') {
  switch (kind) {
    case 'error':
      return 'border-red-500/35 bg-red-500/10 text-red-200';
    case 'warning':
      return 'border-amber-500/35 bg-amber-500/10 text-amber-100';
    case 'clean':
      return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100';
    default:
      return 'border-slate-400/35 bg-slate-500/10 text-slate-200';
  }
}

function bucketChipClass(bucketId: AnalysisBucketId) {
  switch (bucketId) {
    case 'error':
      return countChipClass('error');
    case 'warning':
      return countChipClass('warning');
    case 'clean':
      return countChipClass('clean');
    default:
      return countChipClass('pending');
  }
}

function bucketLabel(bucketId: AnalysisBucketId) {
  switch (bucketId) {
    case 'error':
      return t('analysis.buckets.error');
    case 'warning':
      return t('analysis.buckets.warning');
    case 'clean':
      return t('analysis.buckets.clean');
    default:
      return t('analysis.buckets.notAnalyzed');
  }
}

function bucketMetric(bucket: AnalysisBucketPresentation) {
  switch (bucket.id) {
    case 'error':
      return `E${bucket.errorCount}`;
    case 'warning':
      return `W${bucket.warningCount}`;
    case 'clean':
      return `OK${bucket.cleanCount}`;
    default:
      return `P${bucket.notAnalyzedCount}`;
  }
}

function severityLabel(severity: AnalysisSeverity) {
  switch (severity) {
    case 'error':
      return t('analysis.severityLabel.error');
    case 'warning':
      return t('analysis.severityLabel.warning');
    default:
      return t('analysis.severityLabel.info');
  }
}

function severityShortLabel(severity: AnalysisSeverity) {
  switch (severity) {
    case 'error':
      return t('analysis.severityShort.error');
    case 'warning':
      return t('analysis.severityShort.warning');
    default:
      return t('analysis.severityShort.info');
  }
}

function instanceStatusLabel(status: 'not-analyzed' | 'ok' | 'issues') {
  switch (status) {
    case 'ok':
      return t('analysis.instanceStatus.ok');
    case 'not-analyzed':
      return t('analysis.instanceStatus.notAnalyzed');
    default:
      return t('analysis.instanceStatus.issues');
  }
}

function findingButtonClass(finding: AnalysisFindingPresentation, active: boolean) {
  const activeClass = active ? 'ring-2 ring-vscode-focus-border' : '';
  if (finding.severity === 'error') {
    return `border-red-500/35 bg-red-500/10 text-red-100 hover:bg-red-500/14 ${activeClass}`.trim();
  }
  if (finding.severity === 'warning') {
    return `border-amber-500/35 bg-amber-500/10 text-amber-50 hover:bg-amber-500/14 ${activeClass}`.trim();
  }
  return `border-vscode-panel-border bg-vscode-input-background/35 text-vscode-foreground hover:bg-vscode-input-background ${activeClass}`.trim();
}

onMounted(() => {
  disposers.push(
    onMessage<{ snapshot: AnalysisPresentationSnapshot }>('analysisSnapshot', payload => {
      snapshot.value = payload.snapshot;
    })
  );

  postMessage({ command: 'getAnalysisSnapshot' });
});

onUnmounted(() => {
  disposers.forEach(dispose => dispose());
  disposers.length = 0;
});
</script>
