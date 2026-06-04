export type MemoryMapFormat = 'gnu';

export interface MemoryRegionUsage {
  name: string;
  origin: number;
  length: number;
  attributes?: string;
  runtimeUsed: number;
  loadUsed: number;
  runtimePercent?: number;
  loadPercent?: number;
}

export interface MemorySectionUsage {
  name: string;
  address: number;
  size: number;
  loadAddress?: number;
  regionName?: string;
  loadRegionName?: string;
}

export interface MemorySymbolEntry {
  name: string;
  section: string;
  outputSection: string;
  objectPath: string;
  regionName?: string;
  address: number;
  size: number;
  line: number;
}

export interface MemoryMapSnapshot {
  format: MemoryMapFormat;
  mapPath: string;
  mapFileName: string;
  buildPath?: string;
  boardName?: string;
  parsedAt: string;
  modifiedAt?: string;
  totalRuntimeBytes: number;
  totalLoadBytes: number;
  regions: MemoryRegionUsage[];
  sections: MemorySectionUsage[];
  topSymbols: MemorySymbolEntry[];
  warnings: string[];
}

export interface MemoryMapParseOptions {
  mapPath: string;
  mapFileName?: string;
  buildPath?: string;
  boardName?: string;
  modifiedAt?: string;
  parsedAt?: string;
  topSymbolLimit?: number;
}
