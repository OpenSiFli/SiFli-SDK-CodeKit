import * as fs from 'fs';
import * as path from 'path';
import { load } from 'js-yaml';
import { DebugSnapshotChipOption, DebugSnapshotModelId } from '../../types/debugSnapshot';

export interface DebugSnapshotChipMemory {
  mpi: string;
  type: string;
  size: number;
}

export interface DebugSnapshotChipDefinition {
  modelId: DebugSnapshotModelId;
  partNumber: string;
  description?: string;
  memories: DebugSnapshotChipMemory[];
}

interface RawChipFile {
  model_id?: string;
  variants?: RawChipVariant[];
}

interface RawChipVariant {
  part_number?: string;
  description?: string;
  memory?: RawChipMemory[];
}

interface RawChipMemory {
  mpi?: string;
  type?: string;
  size?: number;
}

export const SUPPORTED_DEBUG_SNAPSHOT_MODELS: readonly DebugSnapshotModelId[] = [
  'SF32LB52X',
  'SF32LB52x',
  'SF32LB56x',
  'SF32LB58x',
];

export class ChipCatalogService {
  private readonly chipsRoot: string;
  private cache?: Map<string, DebugSnapshotChipDefinition>;

  constructor(private readonly extensionPath: string) {
    this.chipsRoot = path.join(extensionPath, 'SiliconSchema', 'chips');
  }

  public listChipOptions(): DebugSnapshotChipOption[] {
    return Array.from(this.getCatalog().values())
      .map(definition => ({
        partNumber: definition.partNumber,
        modelId: definition.modelId,
        description: definition.description,
        psramCount: definition.memories.filter(memory => memory.type === 'psram').length,
        psramSummary: this.buildPsramSummary(definition.memories),
      }))
      .sort((left, right) => left.partNumber.localeCompare(right.partNumber));
  }

  public getChipDefinition(partNumber: string): DebugSnapshotChipDefinition | undefined {
    return this.getCatalog().get(partNumber);
  }

  private getCatalog(): Map<string, DebugSnapshotChipDefinition> {
    if (this.cache) {
      return this.cache;
    }

    const catalog = new Map<string, DebugSnapshotChipDefinition>();
    for (const modelId of SUPPORTED_DEBUG_SNAPSHOT_MODELS) {
      const filePath = path.join(this.chipsRoot, modelId === 'SF32LB52X' ? 'SF32LB52_X' : modelId, 'chip.yaml');
      const entries = this.parseChipFile(filePath);
      for (const entry of entries) {
        catalog.set(entry.partNumber, entry);
      }
    }

    this.cache = catalog;
    return catalog;
  }

  private parseChipFile(filePath: string): DebugSnapshotChipDefinition[] {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = load(raw) as RawChipFile;
    const modelId = parsed.model_id;
    if (!this.isSupportedModelId(modelId)) {
      return [];
    }

    const entries: DebugSnapshotChipDefinition[] = [];
    for (const variant of parsed.variants ?? []) {
      if (!variant.part_number) {
        continue;
      }

      entries.push({
        modelId,
        partNumber: variant.part_number,
        description: variant.description?.trim() || undefined,
        memories: (variant.memory ?? [])
          .map(memory => ({
            mpi: memory.mpi?.trim() ?? '',
            type: memory.type?.trim() ?? '',
            size: typeof memory.size === 'number' ? memory.size : 0,
          }))
          .filter(memory => memory.mpi && memory.type && memory.size > 0),
      });
    }

    return entries;
  }

  private buildPsramSummary(memories: readonly DebugSnapshotChipMemory[]): string {
    const psramMemories = memories.filter(memory => memory.type === 'psram');
    if (psramMemories.length === 0) {
      return 'No PSRAM';
    }

    return psramMemories
      .sort((left, right) => left.mpi.localeCompare(right.mpi))
      .map(memory => `${memory.mpi.toUpperCase()} ${this.formatBytes(memory.size)}`)
      .join(', ');
  }

  private formatBytes(size: number): string {
    const megabytes = size / (1024 * 1024);
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(2)}MB`;
  }

  private isSupportedModelId(modelId: string | undefined): modelId is DebugSnapshotModelId {
    return SUPPORTED_DEBUG_SNAPSHOT_MODELS.includes(modelId as DebugSnapshotModelId);
  }
}
