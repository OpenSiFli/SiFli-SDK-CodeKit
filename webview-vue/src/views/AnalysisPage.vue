<template>
  <section class="space-y-6">
    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">Peripheral Analysis</p>
          <h2 class="mt-3 text-3xl font-semibold tracking-tight">分析结果仪表板</h2>
          <p class="mt-2 max-w-3xl text-sm text-vscode-input-placeholder">
            {{ subtitle }}
          </p>
        </div>

        <div class="flex flex-wrap gap-3">
          <BaseButton variant="primary" @click="runAnalysis">运行分析</BaseButton>
          <BaseButton variant="secondary" @click="resetFilters">重置筛选</BaseButton>
        </div>
      </div>

      <div class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div class="rounded-2xl border border-red-500/25 bg-red-500/8 px-4 py-4">
          <p class="text-xs uppercase tracking-[0.22em] text-red-200/80">Errors</p>
          <p class="mt-3 text-3xl font-semibold text-red-100">{{ summary.errorCount }}</p>
        </div>
        <div class="rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-4">
          <p class="text-xs uppercase tracking-[0.22em] text-amber-100/80">Warnings</p>
          <p class="mt-3 text-3xl font-semibold text-amber-50">{{ summary.warningCount }}</p>
        </div>
        <div class="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-4">
          <p class="text-xs uppercase tracking-[0.22em] text-emerald-100/80">Clean</p>
          <p class="mt-3 text-3xl font-semibold text-emerald-50">{{ summary.cleanCount }}</p>
        </div>
        <div class="rounded-2xl border border-slate-400/25 bg-slate-500/8 px-4 py-4">
          <p class="text-xs uppercase tracking-[0.22em] text-slate-200/80">Pending</p>
          <p class="mt-3 text-3xl font-semibold text-slate-100">{{ summary.notAnalyzedCount }}</p>
        </div>
        <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/40 px-4 py-4">
          <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">Visible Scope</p>
          <p class="mt-3 text-3xl font-semibold">{{ summary.visibleGroups }}</p>
          <p class="mt-2 text-xs text-vscode-input-placeholder">
            {{ summary.visibleInstances }} / {{ summary.totalInstances }} instances
          </p>
        </div>
      </div>
    </div>

    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <div class="flex flex-col gap-5">
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">View</span>
          <button
            class="rounded-full border px-4 py-2 text-sm transition-colors"
            :class="modeButtonClass(viewMode === 'peripheral')"
            @click="setViewMode('peripheral')"
          >
            按外设
          </button>
          <button
            class="rounded-full border px-4 py-2 text-sm transition-colors"
            :class="modeButtonClass(viewMode === 'severity')"
            @click="setViewMode('severity')"
          >
            按结果类型
          </button>
        </div>

        <div class="grid gap-4 xl:grid-cols-[220px_220px_1fr]">
          <div>
            <p class="mb-2 text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">Severity</p>
            <BaseSelect v-model="severityFilter" :options="severityOptions" />
          </div>

          <div>
            <p class="mb-2 text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">Status</p>
            <BaseSelect v-model="statusFilter" :options="statusOptions" />
          </div>

          <div>
            <p class="mb-2 text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">Groups</p>
            <div class="flex flex-wrap gap-2">
              <button
                class="rounded-full border px-3 py-2 text-sm transition-colors"
                :class="groupButtonClass(filters.groups.length === 0)"
                @click="selectAllGroups"
              >
                全部
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
                <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">Group</p>
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
                <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">Bucket</p>
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
                    <p class="text-sm uppercase tracking-[0.18em] text-vscode-input-placeholder">Group</p>
                    <p class="mt-1 text-lg font-semibold">{{ group.groupName }}</p>
                  </div>
                  <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">
                    {{ group.instances.length }} instances
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
          <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">Details</p>
          <h3 class="mt-3 text-2xl font-semibold tracking-tight">
            {{ severityLabel(selectedFinding.severity) }} {{ selectedFinding.message }}
          </h3>

          <div class="mt-5 space-y-3">
            <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">Peripheral</p>
              <p class="mt-2 text-sm">{{ selectedFinding.peripheralName }}</p>
            </div>
            <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">Group</p>
              <p class="mt-2 text-sm">{{ selectedFinding.groupName }}</p>
            </div>
            <div class="rounded-2xl border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4">
              <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">Register</p>
              <p class="mt-2 break-all text-sm">{{ selectedFinding.relatedRegister || 'N/A' }}</p>
            </div>
          </div>

          <div
            v-if="selectedFinding.suggestion"
            class="mt-5 rounded-2xl border border-vscode-panel-border bg-vscode-input-background/35 px-4 py-4"
          >
            <p class="text-xs uppercase tracking-[0.18em] text-vscode-input-placeholder">Suggestion</p>
            <p class="mt-3 whitespace-pre-wrap text-sm leading-6">{{ selectedFinding.suggestion }}</p>
          </div>

          <div
            v-else
            class="mt-5 rounded-2xl border border-dashed border-vscode-panel-border px-4 py-4 text-sm text-vscode-input-placeholder"
          >
            当前条目没有额外建议。
          </div>
        </template>

        <template v-else>
          <p class="text-xs uppercase tracking-[0.22em] text-vscode-input-placeholder">Details</p>
          <div
            class="mt-4 rounded-2xl border border-dashed border-vscode-panel-border px-4 py-8 text-sm text-vscode-input-placeholder"
          >
            从左侧选择一条错误或警告后，这里会显示完整建议和关联寄存器。
          </div>
        </template>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
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
  AnalysisStatusFilter,
  AnalysisViewMode,
} from '@/types';

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
    return '当前没有可用的 sifli-probe-rs 调试会话。进入暂停状态后运行分析，仪表板会同步显示错误和警告。';
  }

  const chipText = snapshot.value.chipModel ? `芯片模型 ${snapshot.value.chipModel}` : '当前芯片';
  const deviceText = snapshot.value.deviceName ? `设备 ${snapshot.value.deviceName}` : '当前设备';
  return `${chipText}，${deviceText}。仪表板与调试侧栏共享同一份筛选和视图状态。`;
});

const emptyMessage = computed(() => {
  if (!snapshot.value?.hasActiveSession) {
    return '当前没有可用的调试会话。启动并暂停 sifli-probe-rs 会话后再查看分析结果。';
  }

  return snapshot.value.message || '当前筛选条件下没有可显示的结果。';
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

const severityOptions = [
  { value: 'all', label: '全部严重级别' },
  { value: 'error', label: '仅错误' },
  { value: 'warning', label: '仅警告' },
];

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'issues', label: '仅问题项' },
  { value: 'clean', label: '仅正常项' },
];

const severityFilter = computed({
  get: () => filters.value.severity,
  set: value => {
    postMessage({
      command: 'updateAnalysisFilters',
      filters: {
        severity: value,
      },
    });
  },
});

const statusFilter = computed({
  get: () => filters.value.status,
  set: value => {
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
      return '错误';
    case 'warning':
      return '警告';
    case 'clean':
      return '正常';
    default:
      return '未分析';
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
      return '错误:';
    case 'warning':
      return '警告:';
    default:
      return '信息:';
  }
}

function severityShortLabel(severity: AnalysisSeverity) {
  switch (severity) {
    case 'error':
      return 'Error';
    case 'warning':
      return 'Warn';
    default:
      return 'Info';
  }
}

function instanceStatusLabel(status: 'not-analyzed' | 'ok' | 'issues') {
  switch (status) {
    case 'ok':
      return '当前分析未发现问题。';
    case 'not-analyzed':
      return '尚未运行到该实例的分析结果。';
    default:
      return '当前实例存在需要处理的配置问题。';
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
