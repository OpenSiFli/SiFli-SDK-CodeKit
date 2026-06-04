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

const DEFAULT_TOP_SYMBOL_LIMIT = 500;
const HEX_PATTERN = '0x[0-9a-fA-F]+';
const MEMORY_CONFIG_HEADER = 'Memory Configuration';
const LINKER_MAP_HEADER = 'Linker script and memory map';
const CROSS_REFERENCE_HEADER = 'Cross Reference Table';

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
  let pendingInputSection: PendingInputSection | undefined;
  let lastSymbolCandidate: MemorySymbolEntry | undefined;

  for (let index = linkerHeaderIndex + 1; index < bodyEndIndex; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;

    const outputSection = parseOutputSectionLine(line);
    if (outputSection) {
      pendingInputSection = undefined;
      lastSymbolCandidate = undefined;
      if (shouldIncludeOutputSection(outputSection.name, outputSection.address, outputSection.size)) {
        const regionName = findRegionName(regions, outputSection.address);
        const loadRegionName =
          outputSection.loadAddress !== undefined ? findRegionName(regions, outputSection.loadAddress) : regionName;

        currentOutputSection = {
          ...outputSection,
          regionName,
        };

        sections.push({
          ...outputSection,
          regionName,
          loadRegionName,
        });

        if (regionName) {
          usageByName.get(regionName)!.runtimeUsed += outputSection.size;
        } else {
          warnings.push(
            `Section ${outputSection.name} at ${formatHex(outputSection.address)} is outside known memory.`
          );
        }

        if (isLoadableSection(outputSection.name)) {
          const loadAddress = outputSection.loadAddress ?? outputSection.address;
          const targetLoadRegion = findRegionName(regions, loadAddress);
          if (targetLoadRegion) {
            usageByName.get(targetLoadRegion)!.loadUsed += outputSection.size;
          }
        }
      } else {
        currentOutputSection = undefined;
      }
      continue;
    }

    if (!currentOutputSection) {
      continue;
    }

    const pendingSection = parsePendingInputSectionLine(line);
    if (pendingSection) {
      pendingInputSection = {
        name: pendingSection,
        line: lineNumber,
      };
      lastSymbolCandidate = undefined;
      continue;
    }

    const inputSection = parseInputSectionLine(line, pendingInputSection, lineNumber);
    if (inputSection) {
      pendingInputSection = undefined;
      lastSymbolCandidate = undefined;
      if (!shouldIncludeInputSection(inputSection.section, inputSection.address, inputSection.size)) {
        continue;
      }

      const regionName = findRegionName(regions, inputSection.address) ?? currentOutputSection.regionName;
      const entry: MemorySymbolEntry = {
        name: fallbackSymbolName(inputSection.section, inputSection.objectPath),
        section: inputSection.section,
        outputSection: currentOutputSection.name,
        objectPath: inputSection.objectPath,
        regionName,
        address: inputSection.address,
        size: inputSection.size,
        line: inputSection.line,
      };
      symbols.push(entry);
      lastSymbolCandidate = entry;
      continue;
    }

    const symbolName = parseSymbolLine(line, lastSymbolCandidate);
    if (symbolName && lastSymbolCandidate) {
      lastSymbolCandidate.name = symbolName;
      lastSymbolCandidate = undefined;
    }
  }

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

function parsePendingInputSectionLine(line: string): string | null {
  const match = line.match(/^\s+(\.\S+)\s*$/);
  if (!match) {
    return null;
  }
  return match[1];
}

function parseInputSectionLine(
  line: string,
  pending: PendingInputSection | undefined,
  lineNumber: number
): { section: string; address: number; size: number; objectPath: string; line: number } | null {
  const inline = line.match(new RegExp(`^\\s+(\\.\\S+)\\s+(${HEX_PATTERN})\\s+(${HEX_PATTERN})\\s+(.+?)\\s*$`));
  if (inline) {
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
  if (!continued) {
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

function parseSymbolLine(line: string, lastSymbolCandidate: MemorySymbolEntry | undefined): string | null {
  if (!lastSymbolCandidate) {
    return null;
  }

  const match = line.match(new RegExp(`^\\s+(${HEX_PATTERN})\\s+(.+?)\\s*$`));
  if (!match) {
    return null;
  }

  const address = parseHex(match[1]);
  if (address < lastSymbolCandidate.address || address >= lastSymbolCandidate.address + lastSymbolCandidate.size) {
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
    symbol.startsWith('[!provide]')
  ) {
    return null;
  }

  return symbol;
}

function shouldIncludeOutputSection(name: string, address: number, size: number): boolean {
  if (address === 0 || size === 0) {
    return false;
  }

  return !isDebugOrMetadataSection(name);
}

function shouldIncludeInputSection(name: string, address: number, size: number): boolean {
  if (address === 0 || size === 0) {
    return false;
  }

  return !isDebugOrMetadataSection(name);
}

function isDebugOrMetadataSection(name: string): boolean {
  return name.startsWith('.debug') || name === '.comment' || name === '.ARM.attributes' || name === '.note.GNU-stack';
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
