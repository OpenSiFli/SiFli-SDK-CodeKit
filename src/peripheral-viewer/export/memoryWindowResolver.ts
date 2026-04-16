import { DebugSnapshotModelId } from '../../types/debugSnapshot';
import { DebugSnapshotChipDefinition, DebugSnapshotChipMemory } from './chipCatalogService';

export interface DebugSnapshotPsramRegion {
  fileName: 'psram.bin' | 'psram2.bin';
  address: number;
  size: number;
  backingMpi: string;
}

const MPI_SORT_ORDER: Record<string, number> = {
  mpi1: 1,
  mpi2: 2,
  mpi3: 3,
  mpi4: 4,
  mpi5: 5,
};

export function resolvePsramWindowAddress(modelId: DebugSnapshotModelId, mpi: string): number {
  switch (modelId) {
    case 'SF32LB52X':
    case 'SF32LB52x':
      if (mpi === 'mpi1') {
        return 0x60000000;
      }
      break;
    case 'SF32LB56x':
      if (mpi === 'mpi1') {
        return 0x60000000;
      }
      if (mpi === 'mpi2') {
        return 0x60800000;
      }
      break;
    case 'SF32LB58x':
      if (mpi === 'mpi1') {
        return 0x60000000;
      }
      if (mpi === 'mpi2') {
        return 0x62000000;
      }
      break;
    default:
      break;
  }

  throw new Error(`Unsupported PSRAM mapping for ${modelId} ${mpi}.`);
}

export function resolvePsramRegions(chip: DebugSnapshotChipDefinition): DebugSnapshotPsramRegion[] {
  const psramMemories = chip.memories
    .filter(memory => memory.type === 'psram')
    .sort(
      (left, right) =>
        (MPI_SORT_ORDER[left.mpi] ?? Number.MAX_SAFE_INTEGER) - (MPI_SORT_ORDER[right.mpi] ?? Number.MAX_SAFE_INTEGER)
    );

  if (psramMemories.length > 2) {
    throw new Error(`Only up to two PSRAM devices are supported for ${chip.partNumber}.`);
  }

  return psramMemories.map((memory, index) => ({
    fileName: index === 0 ? 'psram.bin' : 'psram2.bin',
    address: resolvePsramWindowAddress(chip.modelId, memory.mpi),
    size: memory.size,
    backingMpi: memory.mpi,
  }));
}

export function summarizePsramMemories(memories: readonly DebugSnapshotChipMemory[]): string[] {
  return memories.filter(memory => memory.type === 'psram').map(memory => `${memory.mpi}:${memory.size}`);
}
