import * as path from 'path';
import {
  MemoryMapParseOptions,
  MemoryMapSnapshot,
  MemoryRegionUsage,
  MemorySectionUsage,
  MemorySymbolEntry,
} from '../types/memoryMap';

interface ParsedMemoryRegion {
  name: string;
  origin: number;
  length: number;
  attributes?: string;
}

interface MutableRegionUsage extends MemoryRegionUsage {
  runtimeUsed: number;
  loadUsed: number;
}

interface OutputSectionContext {
  name: string;
  address: number;
  size: number;
  loadAddress?: number;
  regionName?: string;
}

interface PendingInputSection {
  name: string;
  line: number;
}

interface PendingOutputSection {
  name: string;
}

interface ParsedInputSection {
  section: string;
  address: number;
  size: number;
  objectPath: string;
  line: number;
}

interface SymbolCandidate {
  name: string;
  address: number;
  line: number;
}

interface InputSectionContext extends ParsedInputSection {
  outputSection: string;
  outputSectionAddress: number;
  outputSectionLoadAddress?: number;
  regionName?: string;
  symbols: SymbolCandidate[];
}

interface MemoryRangeFragment {
  address: number;
  size: number;
  regionName?: string;
}

const DEFAULT_TOP_SYMBOL_LIMIT = 500;
const HEX_PATTERN = '0x[0-9a-fA-F]+';
const MEMORY_CONFIG_HEADER = 'Memory Configuration';
const LINKER_MAP_HEADER = 'Linker script and memory map';
const CROSS_REFERENCE_HEADER = 'Cross Reference Table';
const NON_DOT_INPUT_SECTIONS = new Set(['COMMON']);
const GENERATED_DATA_DIRECTIVE_PATTERN = /^(?:BYTE|SHORT|LONG|QUAD|SQUAD|FILL|ASCIZ?|CREATE_OBJECT_SYMBOLS)(?:\s|$)/i;

export function parseGnuMap(content: string, options: MemoryMapParseOptions): MemoryMapSnapshot {
  const lines = content.split(/\r?\n/);
  const memoryHeaderIndex = lines.findIndex(line => line.trim() === MEMORY_CONFIG_HEADER);
  const linkerHeaderIndex = lines.findIndex(line => line.trim() === LINKER_MAP_HEADER);

  if (linkerHeaderIndex < 0 || memoryHeaderIndex < 0 || memoryHeaderIndex > linkerHeaderIndex) {
    throw new Error('The selected map file does not look like a GNU ld map file.');
  }

  const regions = parseMemoryRegions(lines, memoryHeaderIndex + 1, linkerHeaderIndex);
  if (regions.length === 0) {
    throw new Error('No memory regions were found in the GNU map file.');
  }

  const usageByName = new Map<string, MutableRegionUsage>();
  for (const region of regions) {
    usageByName.set(region.name, {
      ...region,
      runtimeUsed: 0,
      loadUsed: 0,
    });
  }

  const warnings: string[] = [];
  const sections: MemorySectionUsage[] = [];
  const symbols: MemorySymbolEntry[] = [];
  const topSymbolLimit = options.topSymbolLimit ?? DEFAULT_TOP_SYMBOL_LIMIT;
  const bodyEndIndex = findBodyEndIndex(lines, linkerHeaderIndex + 1);
  let currentOutputSection: OutputSectionContext | undefined;
  let currentInputSection: InputSectionContext | undefined;
  let pendingOutputSection: PendingOutputSection | undefined;
  let pendingInputSection: PendingInputSection | undefined;

  const finalizeInputSection = () => {
    if (!currentInputSection) {
      return;
    }

    symbols.push(...buildSymbolEntries(currentInputSection, regions));
    currentInputSection = undefined;
  };

  for (let index = linkerHeaderIndex + 1; index < bodyEndIndex; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (pendingOutputSection) {
      const continuedOutputSection = parseContinuedOutputSectionLine(line, pendingOutputSection);
      if (continuedOutputSection) {
        finalizeInputSection();
        pendingOutputSection = undefined;
        pendingInputSection = undefined;
        currentOutputSection = includeOutputSection(continuedOutputSection, regions, usageByName, sections, warnings);
        continue;
      }

      if (line.trim()) {
        pendingOutputSection = undefined;
      }
    }

    const outputSection = parseOutputSectionLine(line);
    if (outputSection) {
      finalizeInputSection();
      pendingOutputSection = undefined;
      pendingInputSection = undefined;
      currentOutputSection = includeOutputSection(outputSection, regions, usageByName, sections, warnings);
      continue;
    }

    const pendingOutputSectionName = parsePendingOutputSectionLine(line);
    if (pendingOutputSectionName) {
      finalizeInputSection();
      pendingOutputSection = {
        name: pendingOutputSectionName,
      };
      pendingInputSection = undefined;
      currentOutputSection = undefined;
      continue;
    }

    if (!currentOutputSection) {
      continue;
    }

    const pendingSection = parsePendingInputSectionLine(line);
    if (pendingSection) {
      finalizeInputSection();
      pendingInputSection = {
        name: pendingSection,
        line: lineNumber,
      };
      continue;
    }

    const inputSection = parseInputSectionLine(line, pendingInputSection, lineNumber);
    if (inputSection) {
      finalizeInputSection();
      pendingInputSection = undefined;
      if (!shouldIncludeInputSection(inputSection.section, inputSection.address, inputSection.size)) {
        continue;
      }

      const regionName = findRegionName(regions, inputSection.address) ?? currentOutputSection.regionName;
      currentInputSection = {
        ...inputSection,
        outputSection: currentOutputSection.name,
        outputSectionAddress: currentOutputSection.address,
        outputSectionLoadAddress: currentOutputSection.loadAddress,
        regionName,
        symbols: [],
      };
      continue;
    }

    const symbol = parseSymbolLine(line, currentInputSection, lineNumber);
    if (symbol && currentInputSection) {
      currentInputSection.symbols.push(symbol);
    }
  }

  finalizeInputSection();

  const finalizedRegions = [...usageByName.values()].map(region => ({
    ...region,
    runtimePercent: percent(region.runtimeUsed, region.length),
    loadPercent: percent(region.loadUsed, region.length),
  }));

  const topSymbols = symbols.sort((left, right) => {
    if (right.size !== left.size) {
      return right.size - left.size;
    }
    return left.name.localeCompare(right.name);
  });

  return {
    format: 'gnu',
    mapPath: options.mapPath,
    mapFileName: options.mapFileName ?? path.basename(options.mapPath),
    buildPath: options.buildPath,
    boardName: options.boardName,
    parsedAt: options.parsedAt ?? new Date().toISOString(),
    modifiedAt: options.modifiedAt,
    totalRuntimeBytes: finalizedRegions.reduce((sum, region) => sum + region.runtimeUsed, 0),
    totalLoadBytes: finalizedRegions.reduce((sum, region) => sum + region.loadUsed, 0),
    regions: finalizedRegions,
    sections,
    topSymbols: topSymbols.slice(0, topSymbolLimit),
    warnings,
  };
}

function parseMemoryRegions(lines: string[], startIndex: number, endIndex: number): ParsedMemoryRegion[] {
  const regions: ParsedMemoryRegion[] = [];
  const regionPattern = new RegExp(`^(\\S+)\\s+(${HEX_PATTERN})\\s+(${HEX_PATTERN})(?:\\s+(.*))?$`);

  for (let index = startIndex; index < endIndex; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('Name ') || trimmed === '*default*') {
      continue;
    }

    const match = trimmed.match(regionPattern);
    if (!match || match[1] === '*default*') {
      continue;
    }

    regions.push({
      name: match[1],
      origin: parseHex(match[2]),
      length: parseHex(match[3]),
      attributes: match[4]?.trim() || undefined,
    });
  }

  return regions;
}

function findBodyEndIndex(lines: string[], startIndex: number): number {
  const crossReferenceIndex = lines.findIndex(
    (line, index) => index >= startIndex && line.trim() === CROSS_REFERENCE_HEADER
  );
  return crossReferenceIndex >= 0 ? crossReferenceIndex : lines.length;
}

function parseOutputSectionLine(
  line: string
): { name: string; address: number; size: number; loadAddress?: number } | null {
  if (/^\s/.test(line)) {
    return null;
  }

  const match = line.match(
    new RegExp(`^(\\.\\S+)\\s+(${HEX_PATTERN})\\s+(${HEX_PATTERN})(?:\\s+load address\\s+(${HEX_PATTERN}))?`)
  );
  if (!match) {
    return null;
  }

  return {
    name: match[1],
    address: parseHex(match[2]),
    size: parseHex(match[3]),
    loadAddress: match[4] ? parseHex(match[4]) : undefined,
  };
}

function parsePendingOutputSectionLine(line: string): string | null {
  if (/^\s/.test(line)) {
    return null;
  }

  const match = line.match(/^(\.\S+)\s*$/);
  if (!match) {
    return null;
  }
  return match[1];
}

function parseContinuedOutputSectionLine(
  line: string,
  pending: PendingOutputSection
): { name: string; address: number; size: number; loadAddress?: number } | null {
  const match = line.match(
    new RegExp(`^\\s+(${HEX_PATTERN})\\s+(${HEX_PATTERN})(?:\\s+load address\\s+(${HEX_PATTERN}))?\\s*$`)
  );
  if (!match) {
    return null;
  }

  return {
    name: pending.name,
    address: parseHex(match[1]),
    size: parseHex(match[2]),
    loadAddress: match[3] ? parseHex(match[3]) : undefined,
  };
}

function parsePendingInputSectionLine(line: string): string | null {
  const match = line.match(/^\s+(\S+)\s*$/);
  if (!match || !isInputSectionName(match[1])) {
    return null;
  }
  return match[1];
}

function parseInputSectionLine(
  line: string,
  pending: PendingInputSection | undefined,
  lineNumber: number
): ParsedInputSection | null {
  const inline = line.match(new RegExp(`^\\s+(\\S+)\\s+(${HEX_PATTERN})\\s+(${HEX_PATTERN})\\s+(.+?)\\s*$`));
  if (inline && isInputSectionName(inline[1]) && isInputObjectPath(inline[4])) {
    return {
      section: inline[1],
      address: parseHex(inline[2]),
      size: parseHex(inline[3]),
      objectPath: inline[4].trim(),
      line: lineNumber,
    };
  }

  if (!pending) {
    return null;
  }

  const continued = line.match(new RegExp(`^\\s+(${HEX_PATTERN})\\s+(${HEX_PATTERN})\\s+(.+?)\\s*$`));
  if (!continued || !isInputObjectPath(continued[3])) {
    return null;
  }

  return {
    section: pending.name,
    address: parseHex(continued[1]),
    size: parseHex(continued[2]),
    objectPath: continued[3].trim(),
    line: pending.line,
  };
}

function parseSymbolLine(
  line: string,
  inputSection: InputSectionContext | undefined,
  lineNumber: number
): SymbolCandidate | null {
  if (!inputSection) {
    return null;
  }

  const match = line.match(new RegExp(`^\\s+(${HEX_PATTERN})\\s+(.+?)\\s*$`));
  if (!match) {
    return null;
  }

  const address = parseHex(match[1]);
  if (address < inputSection.address || address >= inputSection.address + inputSection.size) {
    return null;
  }

  const symbol = match[2].trim();
  if (
    !symbol ||
    symbol.startsWith('.') ||
    symbol.startsWith('(') ||
    symbol.startsWith('=') ||
    /\s=\s/.test(symbol) ||
    symbol.startsWith('PROVIDE') ||
    symbol.startsWith('[!provide]') ||
    isArmMappingSymbol(symbol)
  ) {
    return null;
  }

  return {
    name: symbol,
    address,
    line: lineNumber,
  };
}

function includeOutputSection(
  outputSection: { name: string; address: number; size: number; loadAddress?: number },
  regions: ParsedMemoryRegion[],
  usageByName: Map<string, MutableRegionUsage>,
  sections: MemorySectionUsage[],
  warnings: string[]
): OutputSectionContext | undefined {
  if (!shouldIncludeOutputSection(outputSection.name, outputSection.address, outputSection.size)) {
    return undefined;
  }

  const loadAddress = outputSection.loadAddress ?? outputSection.address;
  const regionName = findRegionName(regions, outputSection.address);

  const context = {
    ...outputSection,
    regionName,
  };

  sections.push(...buildSectionUsageEntries(outputSection, regions));

  addUsageByRange(
    usageByName,
    regions,
    outputSection.address,
    outputSection.size,
    outputSection.name,
    'runtime',
    warnings
  );

  if (isLoadableSection(outputSection.name)) {
    addUsageByRange(usageByName, regions, loadAddress, outputSection.size, outputSection.name, 'load', warnings);
  }

  return context;
}

function addUsageByRange(
  usageByName: Map<string, MutableRegionUsage>,
  regions: ParsedMemoryRegion[],
  address: number,
  size: number,
  sectionName: string,
  kind: 'runtime' | 'load',
  warnings: string[]
): void {
  const field = kind === 'runtime' ? 'runtimeUsed' : 'loadUsed';
  const endAddress = address + size;
  let coveredBytes = 0;
  const matchedRegionNames = new Set<string>();

  for (const region of regions) {
    if (region.length <= 0) {
      continue;
    }

    const regionEndAddress = region.origin + region.length;
    const overlapStart = Math.max(address, region.origin);
    const overlapEnd = Math.min(endAddress, regionEndAddress);
    const overlapBytes = Math.max(overlapEnd - overlapStart, 0);
    if (overlapBytes <= 0) {
      continue;
    }

    usageByName.get(region.name)![field] += overlapBytes;
    coveredBytes += overlapBytes;
    matchedRegionNames.add(region.name);
  }

  const label = kind === 'runtime' ? 'Section' : 'Load address for section';
  if (coveredBytes === 0) {
    warnings.push(`${label} ${sectionName} at ${formatHex(address)} is outside known memory.`);
    return;
  }

  if (coveredBytes < size) {
    warnings.push(
      `${label} ${sectionName} at ${formatHex(address)} extends outside known memory by ${formatBytes(
        size - coveredBytes
      )}.`
    );
  }

  if (matchedRegionNames.size > 1) {
    warnings.push(`${label} ${sectionName} spans multiple memory regions: ${[...matchedRegionNames].join(', ')}.`);
  }
}

function buildSymbolEntries(inputSection: InputSectionContext, regions: ParsedMemoryRegion[]): MemorySymbolEntry[] {
  const uniqueCandidates = deduplicateSymbolCandidates(inputSection.symbols);
  if (uniqueCandidates.length === 0) {
    return buildSymbolEntryFragments({
      inputSection,
      name: fallbackSymbolName(inputSection.section, inputSection.objectPath),
      address: inputSection.address,
      size: inputSection.size,
      line: inputSection.line,
      regions,
    });
  }

  const sectionEndAddress = inputSection.address + inputSection.size;
  const entries: MemorySymbolEntry[] = [];

  for (let index = 0; index < uniqueCandidates.length; index += 1) {
    const candidate = uniqueCandidates[index];
    const nextCandidate = uniqueCandidates[index + 1];
    const startAddress = index === 0 ? inputSection.address : candidate.address;
    const endAddress = nextCandidate?.address ?? sectionEndAddress;
    const size = endAddress - startAddress;
    if (size <= 0) {
      continue;
    }

    entries.push(
      ...buildSymbolEntryFragments({
        inputSection,
        name: candidate.name,
        address: startAddress,
        size,
        line: candidate.line,
        regions,
      })
    );
  }

  return entries.length > 0
    ? entries
    : buildSymbolEntryFragments({
        inputSection,
        name: fallbackSymbolName(inputSection.section, inputSection.objectPath),
        address: inputSection.address,
        size: inputSection.size,
        line: inputSection.line,
        regions,
      });
}

function buildSectionUsageEntries(
  outputSection: { name: string; address: number; size: number; loadAddress?: number },
  regions: ParsedMemoryRegion[]
): MemorySectionUsage[] {
  const loadAddressBase = outputSection.loadAddress ?? outputSection.address;
  return buildSectionRangeFragments(regions, outputSection.address, loadAddressBase, outputSection.size).map(
    fragment => {
      const loadAddress =
        outputSection.loadAddress !== undefined
          ? outputSection.loadAddress + (fragment.address - outputSection.address)
          : undefined;
      const loadRegionName = loadAddress !== undefined ? findRegionName(regions, loadAddress) : fragment.regionName;

      return {
        name: outputSection.name,
        address: fragment.address,
        size: fragment.size,
        loadAddress,
        regionName: fragment.regionName,
        loadRegionName,
      };
    }
  );
}

function buildSymbolEntryFragments(options: {
  inputSection: InputSectionContext;
  name: string;
  address: number;
  size: number;
  line: number;
  regions: ParsedMemoryRegion[];
}): MemorySymbolEntry[] {
  const loadAddress =
    options.inputSection.outputSectionLoadAddress !== undefined
      ? options.inputSection.outputSectionLoadAddress + (options.address - options.inputSection.outputSectionAddress)
      : options.address;
  const fragments = buildSectionRangeFragments(options.regions, options.address, loadAddress, options.size);
  return fragments.map(fragment => ({
    name: options.name,
    section: options.inputSection.section,
    outputSection: options.inputSection.outputSection,
    objectPath: options.inputSection.objectPath,
    regionName: fragment.regionName,
    address: fragment.address,
    size: fragment.size,
    line: options.line,
  }));
}

function buildSectionRangeFragments(
  regions: ParsedMemoryRegion[],
  runtimeAddress: number,
  loadAddress: number,
  size: number
): MemoryRangeFragment[] {
  const offsets = new Set([0, size]);
  addRegionBoundaryOffsets(regions, runtimeAddress, size, offsets);
  addRegionBoundaryOffsets(regions, loadAddress, size, offsets);

  const sortedOffsets = [...offsets].sort((left, right) => left - right);
  const fragments: MemoryRangeFragment[] = [];

  for (let index = 0; index < sortedOffsets.length - 1; index += 1) {
    const startOffset = sortedOffsets[index];
    const endOffset = sortedOffsets[index + 1];
    if (endOffset <= startOffset) {
      continue;
    }

    const address = runtimeAddress + startOffset;
    fragments.push({
      address,
      size: endOffset - startOffset,
      regionName: findRegionName(regions, address),
    });
  }

  return fragments.length > 0 ? fragments : [{ address: runtimeAddress, size }];
}

function buildRangeFragments(regions: ParsedMemoryRegion[], address: number, size: number): MemoryRangeFragment[] {
  const endAddress = address + size;
  const boundaries = new Set([address, endAddress]);

  for (const region of regions) {
    if (region.length <= 0) {
      continue;
    }

    const regionEndAddress = region.origin + region.length;
    const overlapStart = Math.max(address, region.origin);
    const overlapEnd = Math.min(endAddress, regionEndAddress);
    if (overlapEnd <= overlapStart) {
      continue;
    }

    boundaries.add(overlapStart);
    boundaries.add(overlapEnd);
  }

  const sortedBoundaries = [...boundaries].sort((left, right) => left - right);
  const fragments: MemoryRangeFragment[] = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const start = sortedBoundaries[index];
    const end = sortedBoundaries[index + 1];
    if (end <= start) {
      continue;
    }

    fragments.push({
      address: start,
      size: end - start,
      regionName: findRegionName(regions, start),
    });
  }

  return fragments.length > 0 ? fragments : [{ address, size }];
}

function addRegionBoundaryOffsets(
  regions: ParsedMemoryRegion[],
  address: number,
  size: number,
  offsets: Set<number>
): void {
  const endAddress = address + size;

  for (const region of regions) {
    if (region.length <= 0) {
      continue;
    }

    const regionEndAddress = region.origin + region.length;
    for (const boundary of [region.origin, regionEndAddress]) {
      if (boundary > address && boundary < endAddress) {
        offsets.add(boundary - address);
      }
    }
  }
}

function deduplicateSymbolCandidates(candidates: SymbolCandidate[]): SymbolCandidate[] {
  const byAddress = new Map<number, SymbolCandidate>();
  for (const candidate of candidates) {
    const existing = byAddress.get(candidate.address);
    if (existing) {
      byAddress.set(candidate.address, {
        ...existing,
        name: `${existing.name} / ${candidate.name}`,
      });
    } else {
      byAddress.set(candidate.address, candidate);
    }
  }

  return [...byAddress.values()].sort((left, right) => {
    if (left.address !== right.address) {
      return left.address - right.address;
    }
    return left.line - right.line;
  });
}

function shouldIncludeOutputSection(name: string, address: number, size: number): boolean {
  if (size === 0) {
    return false;
  }

  return !isDebugOrMetadataSection(name);
}

function shouldIncludeInputSection(name: string, address: number, size: number): boolean {
  if (size === 0) {
    return false;
  }

  return !isDebugOrMetadataSection(name);
}

function isDebugOrMetadataSection(name: string): boolean {
  return name.startsWith('.debug') || name === '.comment' || name === '.ARM.attributes' || name === '.note.GNU-stack';
}

function isInputSectionName(name: string): boolean {
  if (!name || name.startsWith('*') || name.startsWith('(') || name.includes('=')) {
    return false;
  }

  return name.startsWith('.') || NON_DOT_INPUT_SECTIONS.has(name);
}

function isInputObjectPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || GENERATED_DATA_DIRECTIVE_PATTERN.test(trimmed)) {
    return false;
  }

  return /\.(?:o|obj)\b/i.test(trimmed) || /\.(?:a|lib)\(/i.test(trimmed);
}

function isArmMappingSymbol(symbol: string): boolean {
  return /^\$[adtx](?:\.\d+)?$/i.test(symbol);
}

function isLoadableSection(name: string): boolean {
  const lowerName = name.toLowerCase();
  return (
    !lowerName.includes('bss') &&
    lowerName !== '.stack' &&
    lowerName !== '.heap' &&
    !lowerName.startsWith('.noinit') &&
    !lowerName.startsWith('.igot')
  );
}

function findRegionName(regions: ParsedMemoryRegion[], address: number): string | undefined {
  return regions.find(region => {
    if (region.length <= 0) {
      return false;
    }
    return address >= region.origin && address < region.origin + region.length;
  })?.name;
}

function fallbackSymbolName(sectionName: string, objectPath: string): string {
  const prefixes = [
    '.text.startup.',
    '.text.',
    '.rodata.',
    '.data.',
    '.bss.',
    '.l1_ret_text_',
    '.l1_ret_rodata_',
    '.l1_ret_data_',
    '.l2_ret_data_',
    '.l2_ret_bss_',
  ];
  for (const prefix of prefixes) {
    if (sectionName.startsWith(prefix) && sectionName.length > prefix.length) {
      return sectionName.slice(prefix.length);
    }
  }

  if (sectionName.startsWith('.') && sectionName.includes('.', 1)) {
    return sectionName.slice(sectionName.lastIndexOf('.') + 1);
  }

  const objectName = objectPath.match(/([^/\\()]+\.o)\)?$/)?.[1];
  return objectName ? `${sectionName} (${objectName})` : sectionName;
}

function percent(used: number, length: number): number | undefined {
  if (length <= 0) {
    return undefined;
  }
  return (used / length) * 100;
}

function parseHex(value: string): number {
  return Number.parseInt(value, 16);
}

function formatHex(value: number): string {
  return `0x${value.toString(16)}`;
}

function formatBytes(value: number): string {
  return `${value} bytes`;
}
