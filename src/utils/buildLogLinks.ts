import * as fs from 'fs';
import * as path from 'path';

export interface BuildLogLink {
  start: number;
  end: number;
  path: string;
  line: number;
  column?: number;
}

export interface ResolveBuildLogLinksOptions {
  searchRoots?: string[];
  fileExists?: (filePath: string) => boolean;
  platform?: NodeJS.Platform;
}

const LOCATION_PATTERN =
  /(?:^|[^\w@%/\\.-])((?:[A-Za-z]:[\\/]|\/|\.{1,2}[\\/]|[^:\s()[\]{}<>"'`]+[\\/])?[^:\s()[\]{}<>"'`]+\.[A-Za-z0-9_+.-]+):([1-9]\d*)(?::([1-9]\d*))?/g;
const FILE_PATH_PATTERN =
  /(?:^|[^\w@%/\\.-])((?:[A-Za-z]:[\\/]|\/|\.{1,2}[\\/]|[^:\s()[\]{}<>"'`]+[\\/])?[^:\s()[\]{}<>"'`]+\.[A-Za-z0-9_+.-]+)(?=$|[\s)\]{}<>"'`,]|:[^\d])/g;

export function resolveBuildLogLinks(message: string, options: ResolveBuildLogLinksOptions = {}): BuildLogLink[] {
  const fileExists = options.fileExists ?? defaultFileExists;
  const platform = options.platform ?? process.platform;
  const searchRoots = normalizeSearchRoots(options.searchRoots ?? [], platform);
  const links: BuildLogLink[] = [];

  for (const match of message.matchAll(LOCATION_PATTERN)) {
    const rawPath = match[1];
    const line = parsePositiveInteger(match[2]);
    const column = parsePositiveInteger(match[3]);
    if (!rawPath || line === undefined) {
      continue;
    }

    const resolvedPath = resolveExistingPath(rawPath, searchRoots, fileExists, platform);
    if (!resolvedPath) {
      continue;
    }

    const pathOffset = match[0].indexOf(rawPath);
    const start = match.index === undefined ? 0 : match.index + pathOffset;
    const end = start + rawPath.length + 1 + match[2].length + (match[3] ? match[3].length + 1 : 0);
    links.push({
      start,
      end,
      path: resolvedPath,
      line,
      ...(column === undefined ? {} : { column }),
    });
  }

  for (const match of message.matchAll(FILE_PATH_PATTERN)) {
    const rawPath = match[1];
    if (!rawPath) {
      continue;
    }

    const pathOffset = match[0].indexOf(rawPath);
    const start = match.index === undefined ? 0 : match.index + pathOffset;
    const end = start + rawPath.length;
    if (links.some(link => rangesOverlap(start, end, link.start, link.end))) {
      continue;
    }

    const resolvedPath = resolveExistingPath(rawPath, searchRoots, fileExists, platform);
    if (!resolvedPath) {
      continue;
    }

    links.push({
      start,
      end,
      path: resolvedPath,
      line: 1,
    });
  }

  return links.sort((left, right) => left.start - right.start);
}

function resolveExistingPath(
  rawPath: string,
  searchRoots: string[],
  fileExists: (filePath: string) => boolean,
  platform: NodeJS.Platform
): string | undefined {
  const candidate = normalizeSeparators(rawPath, platform);
  const pathApi = getPathApi(platform);

  if (pathApi.isAbsolute(candidate)) {
    return firstExistingPath([pathApi.normalize(candidate)], fileExists, platform);
  }

  return firstExistingPath(
    searchRoots.map(root => pathApi.resolve(root, candidate)),
    fileExists,
    platform
  );
}

function firstExistingPath(
  paths: string[],
  fileExists: (filePath: string) => boolean,
  platform: NodeJS.Platform
): string | undefined {
  const pathApi = getPathApi(platform);
  for (const filePath of paths) {
    const normalized = pathApi.normalize(filePath);
    try {
      if (fileExists(normalized)) {
        return normalized;
      }
    } catch {
      // Ignore filesystem lookup failures and try the next candidate.
    }
  }
  return undefined;
}

function normalizeSearchRoots(roots: string[], platform: NodeJS.Platform): string[] {
  const pathApi = getPathApi(platform);
  const seen = new Set<string>();
  const normalizedRoots: string[] = [];

  for (const root of roots) {
    const normalized = pathApi.normalize(normalizeSeparators(root, platform));
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    normalizedRoots.push(normalized);
  }

  return normalizedRoots;
}

function normalizeSeparators(filePath: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? filePath.replace(/\//g, '\\') : filePath.replace(/\\/g, '/');
}

function getPathApi(platform: NodeJS.Platform): typeof path.win32 | typeof path.posix {
  return platform === 'win32' ? path.win32 : path.posix;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function defaultFileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
