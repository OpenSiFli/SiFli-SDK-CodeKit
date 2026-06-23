import * as path from 'path';
import * as yaml from 'js-yaml';
import { PtabEditTargetKind, PtabPartition, PtabPartitionDraft, PtabPartitionOperation } from '../types/ptab';

export const SUPPORTED_PTAB_SDK_BRANCHES = ['main', 'release/v2.5'] as const;

export function isSupportedPtabSdkBranch(ref: string | undefined): boolean {
  return !!ref && SUPPORTED_PTAB_SDK_BRANCHES.includes(ref as (typeof SUPPORTED_PTAB_SDK_BRANCHES)[number]);
}

export function normalizePtabBoardName(boardName: string): string {
  const trimmed = boardName.trim();
  if (/(?:_hcpu|_lcpu|_acpu)$/i.test(trimmed)) {
    return trimmed.replace(/_(hcpu|lcpu|acpu)$/i, (_, core: string) => `_${core.toLowerCase()}`);
  }
  return `${trimmed}_hcpu`;
}

export function getBaseBoardName(boardName: string): string {
  return boardName.trim().replace(/_(hcpu|lcpu|acpu)$/i, '');
}

export function resolvePtabSourceMode(input: {
  projectFullPtab?: string | null;
  usesOverlay?: boolean;
}): 'board' | 'project_full' | 'overlay' {
  if (input.projectFullPtab) {
    return 'project_full';
  }
  return input.usesOverlay ? 'overlay' : 'board';
}

export function buildSiliconSchemaEnvironment(
  exportedEnv: NodeJS.ProcessEnv,
  bundledSiliconSchema: string | undefined
): NodeJS.ProcessEnv {
  const schemaPath = exportedEnv.SIFLI_SILICON_SCHEMA || exportedEnv.SILICON_SCHEMA_PATH || bundledSiliconSchema;
  return {
    SIFLI_SILICON_SCHEMA: exportedEnv.SIFLI_SILICON_SCHEMA || schemaPath,
    SILICON_SCHEMA_PATH: exportedEnv.SILICON_SCHEMA_PATH || schemaPath,
  };
}

export function getProjectBoardPtabPath(projectEntryPath: string, normalizedBoardName: string): string {
  return path.join(projectEntryPath, normalizedBoardName, 'ptab.yaml');
}

export function getProjectBoardOverlayPath(projectEntryPath: string, normalizedBoardName: string): string {
  return path.join(projectEntryPath, normalizedBoardName, 'ptab.overlay.yaml');
}

export function getProjectChipOverlayPath(projectEntryPath: string, chipDir: string): string {
  return path.join(projectEntryPath, chipDir, 'ptab.overlay.yaml');
}

export function parseYamlFragment(value: string | undefined, fallback: unknown): unknown {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return fallback;
  }
  return yaml.load(trimmed);
}

export function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : undefined;
}

export function buildPartitionPatchFromDraft(
  draft: PtabPartitionDraft,
  targetKind: PtabEditTargetKind,
  original?: PtabPartition
): Record<string, unknown> {
  const operation: PtabPartitionOperation = draft.originalName ? (draft.operation ?? 'override') : 'add';
  if (
    original &&
    operation === 'override' &&
    (targetKind === 'project_overlay' || targetKind === 'project_chip_overlay')
  ) {
    return buildOverlayOverridePatch(draft, original);
  }

  const patch: Record<string, unknown> = {
    name: draft.originalName || draft.name,
    op: operation,
  };

  const isAdd = operation === 'add';
  const includeAll = targetKind !== 'project_overlay' && targetKind !== 'project_chip_overlay';

  const assign = (key: string, value: unknown, requiredForAdd = false) => {
    if (value === undefined || value === null || value === '') {
      if (includeAll || requiredForAdd) {
        patch[key] = value;
      }
      return;
    }
    patch[key] = value;
  };

  if (isAdd || includeAll || draft.name !== draft.originalName) {
    patch.name = draft.name.trim();
  }
  if (draft.originalName) {
    patch.__matchName = draft.originalName;
  }

  assign('type', normalizeOptionalString(draft.type), isAdd);
  assign('subtype', normalizeOptionalString(draft.subtype));
  assign('region', normalizeOptionalString(draft.region), isAdd);
  assign('offset', normalizeOptionalString(draft.offset), isAdd);
  assign('size', normalizeOptionalString(draft.size), isAdd);
  assign('core', normalizeOptionalString(draft.core));

  const execRegion = normalizeOptionalString(draft.execRegion);
  const execOffset = normalizeOptionalString(draft.execOffset);
  if (execRegion) {
    patch.exec = {
      region: execRegion,
      offset: execOffset ?? '0',
    };
  } else if (!isAdd && (draft.execRegion !== undefined || draft.execOffset !== undefined)) {
    patch.exec = null;
  }

  const attrs = parseYamlFragment(draft.attrsYaml, undefined);
  if (attrs !== undefined) {
    patch.attrs = attrs;
  }
  const aliases = parseYamlFragment(draft.aliasesYaml, undefined);
  if (aliases !== undefined) {
    patch.aliases = aliases;
  }
  const sections = parseYamlFragment(draft.sectionsYaml, undefined);
  if (sections !== undefined) {
    patch.sections = sections;
  }

  if (targetKind !== 'project_overlay' && targetKind !== 'project_chip_overlay') {
    delete patch.op;
  }

  return patch;
}

function buildOverlayOverridePatch(draft: PtabPartitionDraft, original: PtabPartition): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    name: draft.originalName || original.name,
    op: 'override',
  };
  const assignIfChanged = (key: string, nextValue: unknown, originalValue: unknown) => {
    if (normalizeComparable(nextValue) !== normalizeComparable(originalValue)) {
      patch[key] = nextValue;
    }
  };

  assignIfChanged('type', normalizeOptionalString(draft.type), original.type);
  assignIfChanged('subtype', normalizeOptionalString(draft.subtype) ?? null, original.subtype ?? null);
  assignIfChanged('region', normalizeOptionalString(draft.region), original.region);
  assignIfChanged('offset', normalizeOptionalString(draft.offset), original.offset);
  assignIfChanged('size', normalizeOptionalString(draft.size), original.size);
  assignIfChanged('core', normalizeOptionalString(draft.core) ?? null, original.core ?? null);

  const execRegion = normalizeOptionalString(draft.execRegion);
  const execOffset = normalizeOptionalString(draft.execOffset);
  const nextExec = execRegion ? { region: execRegion, offset: execOffset ?? '0' } : null;
  assignIfChanged('exec', nextExec, original.exec ?? null);

  const attrs = parseYamlFragment(draft.attrsYaml, undefined);
  if (attrs !== undefined) {
    assignIfChanged('attrs', attrs, original.attrs ?? undefined);
  }
  const aliases = parseYamlFragment(draft.aliasesYaml, undefined);
  if (aliases !== undefined) {
    assignIfChanged('aliases', aliases, original.aliases ?? undefined);
  }
  const sections = parseYamlFragment(draft.sectionsYaml, undefined);
  if (sections !== undefined) {
    assignIfChanged('sections', sections, original.sections ?? undefined);
  }

  return patch;
}

function normalizeComparable(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  return JSON.stringify(value);
}

export function upsertPartitionItems(
  partitions: unknown,
  patches: Array<Record<string, unknown>>,
  useOverlayOps: boolean
): Array<Record<string, unknown>> {
  const items = Array.isArray(partitions) ? [...partitions] : [];
  const normalized = items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');

  for (const patch of patches) {
    const name = String(patch.__matchName ?? patch.name ?? '')
      .trim()
      .toLowerCase();
    if (!name) {
      throw new Error('Partition name cannot be empty.');
    }
    const index = normalized.findIndex(
      item =>
        String(item.name ?? '')
          .trim()
          .toLowerCase() === name
    );
    const nextPatch = { ...patch };
    delete nextPatch.__matchName;
    if (!useOverlayOps) {
      delete nextPatch.op;
    }
    if (index >= 0) {
      normalized[index] = {
        ...normalized[index],
        ...nextPatch,
      };
    } else {
      normalized.push(nextPatch);
    }
  }

  return normalized;
}
