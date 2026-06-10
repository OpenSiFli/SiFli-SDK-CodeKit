import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { onMessage, postMessage } from '@/services/vscodeBridge';
import type {
  PtabChangeRequest,
  PtabEditTargetKind,
  PtabGap,
  PtabPartition,
  PtabPartitionDraft,
  PtabSizeUnit,
  PtabSnapshot,
} from '@/types';

type MeasurementField = 'offset' | 'size' | 'execOffset';

interface ParsedMeasurement {
  value: string;
  unit: PtabSizeUnit;
}

const sizeUnitMultipliers: Record<PtabSizeUnit, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
};

const sizeUnits: Array<{ value: PtabSizeUnit; label: string }> = [
  { value: 'B', label: 'B' },
  { value: 'KB', label: 'KiB' },
  { value: 'MB', label: 'MiB' },
  { value: 'GB', label: 'GiB' },
];
const ptabDocsUrl = 'https://docs.sifli.com/projects/sdk/latest/sf32lb52x/middleware/partition_table_v3.html';
const defaultNewPartitionSizeBytes = 64 * 1024;
const requestTimeoutMs = 150_000;

function stringifyFragment(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return JSON.stringify(value, null, 2);
}

function normalizeUnit(value: string | undefined): PtabSizeUnit {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === 'G' || normalized === 'GB' || normalized === 'GIB') {
    return 'GB';
  }
  if (normalized === 'M' || normalized === 'MB' || normalized === 'MIB') {
    return 'MB';
  }
  if (normalized === 'K' || normalized === 'KB' || normalized === 'KIB') {
    return 'KB';
  }
  return 'B';
}

function chooseDisplayUnit(bytes: number): PtabSizeUnit {
  if (bytes > 0 && bytes % sizeUnitMultipliers.GB === 0) {
    return 'GB';
  }
  if (bytes > 0 && bytes % sizeUnitMultipliers.MB === 0) {
    return 'MB';
  }
  if (bytes > 0 && bytes % sizeUnitMultipliers.KB === 0) {
    return 'KB';
  }
  return 'B';
}

function parseMeasurement(value: string | number | null | undefined): ParsedMeasurement {
  if (value === undefined || value === null || value === '') {
    return { value: '', unit: 'B' };
  }

  if (typeof value === 'number') {
    const bytes = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    const unit = chooseDisplayUnit(bytes);
    return {
      value: String(bytes / sizeUnitMultipliers[unit]),
      unit,
    };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { value: '', unit: 'B' };
  }

  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const bytes = Number.parseInt(trimmed, 16);
    const unit = chooseDisplayUnit(bytes);
    return {
      value: String(bytes / sizeUnitMultipliers[unit]),
      unit,
    };
  }

  const match = trimmed.match(/^(\d+)\s*([a-zA-Z]+)?$/);
  if (match) {
    const numericValue = Number.parseInt(match[1], 10);
    const explicitUnit = match[2] ? normalizeUnit(match[2]) : undefined;
    if (explicitUnit) {
      return {
        value: String(numericValue),
        unit: explicitUnit,
      };
    }
    const unit = chooseDisplayUnit(numericValue);
    return {
      value: String(numericValue / sizeUnitMultipliers[unit]),
      unit,
    };
  }

  return { value: '', unit: 'B' };
}

function measurementFromBytes(bytes: number): ParsedMeasurement {
  return parseMeasurement(Math.max(0, Math.trunc(bytes)));
}

function composeMeasurement(value: string | undefined, unit: PtabSizeUnit | undefined): string {
  const trimmedValue = (value ?? '').trim();
  if (!trimmedValue) {
    return '';
  }
  const normalizedUnit = unit ?? 'B';
  return normalizedUnit === 'B' ? trimmedValue : `${trimmedValue}${normalizedUnit}`;
}

function normalizeMeasurementInput(value: string | undefined): string {
  const trimmedValue = (value ?? '').trim();
  if (!trimmedValue) {
    return '';
  }
  const numericValue = Number(trimmedValue);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return '';
  }
  return String(Math.trunc(numericValue));
}

function draftFromPartition(partition: PtabPartition): PtabPartitionDraft {
  const offset = parseMeasurement(partition.offset);
  const size = parseMeasurement(partition.size);
  const execOffset = parseMeasurement(partition.exec?.offset);

  return {
    originalName: partition.name,
    name: partition.name,
    operation: 'override',
    type: partition.type,
    subtype: partition.subtype ?? '',
    region: partition.region,
    offset: String(partition.offset),
    offsetValue: offset.value,
    offsetUnit: offset.unit,
    size: String(partition.size),
    sizeValue: size.value,
    sizeUnit: size.unit,
    core: partition.core ?? '',
    execRegion: partition.exec?.region ?? '',
    execOffset: partition.exec ? String(partition.exec.offset) : '',
    execOffsetValue: partition.exec ? execOffset.value : '',
    execOffsetUnit: execOffset.unit,
    attrsYaml: stringifyFragment(partition.attrs),
    aliasesYaml: stringifyFragment(partition.aliases),
    sectionsYaml: stringifyFragment(partition.sections),
  };
}

function createUniqueName(existingNames: string[], baseName: string): string {
  const usedNames = new Set(existingNames.map(name => name.trim().toLowerCase()).filter(Boolean));
  if (!usedNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let index = 1;
  while (usedNames.has(`${baseName}_${index}`.toLowerCase())) {
    index += 1;
  }
  return `${baseName}_${index}`;
}

function chooseInitialGap(gaps: PtabGap[]): PtabGap | undefined {
  return gaps.find(gap => gap.size_bytes >= defaultNewPartitionSizeBytes) ?? gaps.find(gap => gap.size_bytes > 0);
}

function createNewDraft(input: { regions: string[]; existingNames: string[]; gaps: PtabGap[] }): PtabPartitionDraft {
  const gap = chooseInitialGap(input.gaps);
  const offset = measurementFromBytes(gap?.offset ?? 0);
  const size = measurementFromBytes(
    gap ? Math.min(defaultNewPartitionSizeBytes, gap.size_bytes) : defaultNewPartitionSizeBytes
  );

  return {
    name: createUniqueName(input.existingNames, 'new_partition'),
    operation: 'add',
    type: 'data',
    subtype: 'raw',
    region: gap?.region ?? input.regions[0] ?? 'mpi2',
    offset: composeMeasurement(offset.value, offset.unit),
    offsetValue: offset.value,
    offsetUnit: offset.unit,
    size: composeMeasurement(size.value, size.unit),
    sizeValue: size.value,
    sizeUnit: size.unit,
    core: '',
    execRegion: '',
    execOffset: '',
    execOffsetValue: '',
    execOffsetUnit: 'B',
    attrsYaml: '',
    aliasesYaml: '',
    sectionsYaml: '',
  };
}

function draftToPayload(draft: PtabPartitionDraft): PtabPartitionDraft {
  return {
    originalName: draft.originalName,
    name: draft.name,
    operation: draft.operation,
    type: draft.type,
    subtype: draft.subtype,
    region: draft.region,
    offset: draft.offset,
    offsetValue: draft.offsetValue,
    offsetUnit: draft.offsetUnit,
    size: draft.size,
    sizeValue: draft.sizeValue,
    sizeUnit: draft.sizeUnit,
    core: draft.core,
    execRegion: draft.execRegion,
    execOffset: draft.execOffset,
    execOffsetValue: draft.execOffsetValue,
    execOffsetUnit: draft.execOffsetUnit,
    attrsYaml: draft.attrsYaml,
    aliasesYaml: draft.aliasesYaml,
    sectionsYaml: draft.sectionsYaml,
  };
}

function messageErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const usePtabStore = defineStore('ptab', () => {
  const snapshot = ref<PtabSnapshot | null>(null);
  const loading = ref(false);
  const previewing = ref(false);
  const saving = ref(false);
  const error = ref('');
  const selectedPartitionName = ref('');
  const selectedTargetKind = ref<PtabEditTargetKind>('project_overlay');
  const draft = ref<PtabPartitionDraft | null>(null);
  const originalDraft = ref<PtabPartitionDraft | null>(null);
  let pendingSavePartitionName = '';
  let requestTimeout: ReturnType<typeof setTimeout> | undefined;
  let initialized = false;

  const partitions = computed(() => snapshot.value?.partitions ?? []);
  const regions = computed(() => snapshot.value?.regions ?? []);
  const editTargets = computed(() => snapshot.value?.editTargets ?? []);
  const selectedTarget = computed(
    () => editTargets.value.find(target => target.kind === selectedTargetKind.value) ?? editTargets.value[0] ?? null
  );
  const selectedPartition = computed(
    () =>
      partitions.value.find(partition => partition.name === selectedPartitionName.value) ?? partitions.value[0] ?? null
  );
  const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(originalDraft.value));
  const canSave = computed(
    () => !!draft.value && dirty.value && !!selectedTarget.value?.editable && !saving.value && !previewing.value
  );
  const canPreview = computed(
    () => !!draft.value && dirty.value && !!selectedTarget.value?.editable && !previewing.value && !saving.value
  );

  function clearRequestTimeout() {
    if (requestTimeout) {
      clearTimeout(requestTimeout);
      requestTimeout = undefined;
    }
  }

  function armRequestTimeout(kind: 'preview' | 'save') {
    clearRequestTimeout();
    requestTimeout = setTimeout(() => {
      const stillPending = kind === 'preview' ? previewing.value : saving.value;
      if (!stillPending) {
        return;
      }

      previewing.value = false;
      saving.value = false;
      pendingSavePartitionName = '';
      requestTimeout = undefined;
      error.value =
        'PTAB request timed out before the webview received a response. Check the SiFli SDK CodeKit output.';
    }, requestTimeoutMs);
  }

  function initializeMessaging() {
    if (initialized) {
      return;
    }
    initialized = true;

    onMessage<{ snapshot: PtabSnapshot }>('ptabSnapshot', payload => {
      clearRequestTimeout();
      const hadUnsavedDraft = dirty.value;
      snapshot.value = payload.snapshot;
      loading.value = false;
      previewing.value = false;
      saving.value = false;
      error.value = '';
      chooseDefaultTarget();

      if (hadUnsavedDraft) {
        return;
      }

      if (selectedPartitionName.value && selectedPartition.value) {
        setDraftFromPartition(selectedPartition.value);
      } else if (payload.snapshot.partitions.length > 0) {
        selectPartition(payload.snapshot.partitions[0].name);
      } else {
        draft.value = null;
        originalDraft.value = null;
      }
    });

    onMessage<{ message: string }>('ptabError', payload => {
      clearRequestTimeout();
      error.value = payload.message;
      loading.value = false;
      previewing.value = false;
      saving.value = false;
    });

    onMessage<{ message: string }>('error', payload => {
      clearRequestTimeout();
      error.value = payload.message;
      loading.value = false;
      previewing.value = false;
      saving.value = false;
    });

    onMessage<{ snapshot: PtabSnapshot }>('ptabSaved', payload => {
      clearRequestTimeout();
      saving.value = false;
      snapshot.value = payload.snapshot;
      const savedName = pendingSavePartitionName || draft.value?.name || selectedPartitionName.value;
      pendingSavePartitionName = '';
      const savedPartition = savedName
        ? payload.snapshot.partitions.find(
            partition => partition.name.trim().toLowerCase() === savedName.trim().toLowerCase()
          )
        : undefined;

      if (savedPartition) {
        selectedPartitionName.value = savedPartition.name;
        setDraftFromPartition(savedPartition);
      } else if (selectedPartition.value) {
        setDraftFromPartition(selectedPartition.value);
      } else {
        draft.value = null;
        originalDraft.value = null;
      }
    });
  }

  function chooseDefaultTarget() {
    if (!snapshot.value) {
      return;
    }
    const current = snapshot.value.editTargets.find(target => target.kind === selectedTargetKind.value);
    if (current?.editable) {
      return;
    }
    selectedTargetKind.value =
      snapshot.value.editTargets.find(target => target.recommended && target.editable)?.kind ??
      snapshot.value.editTargets.find(target => target.editable)?.kind ??
      snapshot.value.editTargets[0]?.kind ??
      'project_overlay';
  }

  function fetchSnapshot() {
    initializeMessaging();
    loading.value = true;
    error.value = '';
    postMessage({ command: 'getPtabSnapshot' });
  }

  function selectPartition(name: string) {
    selectedPartitionName.value = name;
    const partition = partitions.value.find(item => item.name === name);
    if (partition) {
      setDraftFromPartition(partition);
    }
  }

  function setDraftFromPartition(partition: PtabPartition) {
    const nextDraft = draftFromPartition(partition);
    draft.value = nextDraft;
    originalDraft.value = { ...nextDraft };
  }

  function updateDraft(values: Partial<PtabPartitionDraft>) {
    if (!draft.value) {
      return;
    }
    draft.value = {
      ...draft.value,
      ...values,
    };
  }

  function updateMeasurement(
    field: MeasurementField,
    values: {
      value?: string;
      unit?: PtabSizeUnit;
    }
  ) {
    if (!draft.value) {
      return;
    }

    const valueKey = `${field}Value` as keyof PtabPartitionDraft;
    const unitKey = `${field}Unit` as keyof PtabPartitionDraft;
    const nextValue = normalizeMeasurementInput(values.value ?? (draft.value[valueKey] as string | undefined) ?? '');
    const nextUnit = values.unit ?? (draft.value[unitKey] as PtabSizeUnit | undefined) ?? 'B';

    draft.value = {
      ...draft.value,
      [field]: composeMeasurement(nextValue, nextUnit),
      [valueKey]: nextValue,
      [unitKey]: nextUnit,
    };
  }

  function addPartition() {
    chooseDefaultTarget();
    const nextDraft = createNewDraft({
      regions: regions.value.map(region => region.name),
      existingNames: partitions.value.map(partition => partition.name),
      gaps: snapshot.value?.gaps ?? [],
    });
    selectedPartitionName.value = '';
    draft.value = nextDraft;
    originalDraft.value = null;
  }

  function discardDraft() {
    if (selectedPartition.value) {
      setDraftFromPartition(selectedPartition.value);
    } else {
      draft.value = null;
      originalDraft.value = null;
    }
  }

  function setTarget(kind: PtabEditTargetKind) {
    selectedTargetKind.value = kind;
  }

  function buildRequest(): PtabChangeRequest | null {
    if (!draft.value) {
      return null;
    }
    return {
      targetKind: selectedTargetKind.value,
      changes: [draftToPayload(draft.value)],
    };
  }

  function previewChanges() {
    const request = buildRequest();
    if (!request) {
      return;
    }
    previewing.value = true;
    error.value = '';
    armRequestTimeout('preview');
    try {
      postMessage({
        command: 'previewPtabChanges',
        request,
      });
    } catch (sendError) {
      clearRequestTimeout();
      previewing.value = false;
      error.value = messageErrorMessage(sendError);
    }
  }

  function saveChanges() {
    const request = buildRequest();
    if (!request) {
      return;
    }
    pendingSavePartitionName = draft.value?.name.trim() ?? '';
    saving.value = true;
    error.value = '';
    armRequestTimeout('save');
    try {
      postMessage({
        command: 'savePtabChanges',
        request,
      });
    } catch (sendError) {
      clearRequestTimeout();
      pendingSavePartitionName = '';
      saving.value = false;
      error.value = messageErrorMessage(sendError);
    }
  }

  function openSource(filePath?: string | null) {
    if (!filePath) {
      return;
    }
    postMessage({
      command: 'openPtabSource',
      path: filePath,
    });
  }

  function openDocs() {
    postMessage({
      command: 'openExternalUrl',
      url: ptabDocsUrl,
    });
  }

  function clearError() {
    error.value = '';
  }

  return {
    snapshot,
    loading,
    previewing,
    saving,
    error,
    selectedPartitionName,
    selectedTargetKind,
    draft,
    originalDraft,
    sizeUnits,
    partitions,
    regions,
    editTargets,
    selectedTarget,
    selectedPartition,
    dirty,
    canSave,
    canPreview,
    initializeMessaging,
    fetchSnapshot,
    selectPartition,
    updateDraft,
    updateMeasurement,
    addPartition,
    discardDraft,
    setTarget,
    previewChanges,
    saveChanges,
    openSource,
    openDocs,
    clearError,
  };
});
