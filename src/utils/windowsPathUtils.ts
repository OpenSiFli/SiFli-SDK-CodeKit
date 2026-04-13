export function getWindowsEnvPath(env: NodeJS.ProcessEnv): string {
  return env.PATH || env.Path || '';
}

export function setWindowsEnvPath(env: NodeJS.ProcessEnv, value: string): void {
  env.PATH = value;
  if (Object.prototype.hasOwnProperty.call(env, 'Path')) {
    env.Path = value;
  }
}

export function prependWindowsPathEntries(currentPath: string, entries: Array<string | undefined | null>): string {
  const orderedEntries = dedupeWindowsPathEntries(entries);
  if (orderedEntries.length === 0) {
    return currentPath;
  }

  const normalizedEntries = new Set(orderedEntries.map(entry => entry.toLowerCase()));
  const remainingEntries = currentPath
    .split(';')
    .map(entry => entry.trim())
    .filter(Boolean)
    .filter(entry => !normalizedEntries.has(entry.toLowerCase()));

  return [...orderedEntries, ...remainingEntries].join(';');
}

export function buildWindowsPowerShellPathCommand(entries: Array<string | undefined | null>): string | undefined {
  const orderedEntries = dedupeWindowsPathEntries(entries);
  if (orderedEntries.length === 0) {
    return undefined;
  }

  const escapedEntries = orderedEntries.map(entry => entry.replace(/"/g, '""'));
  return `$env:Path = "${escapedEntries.join(';')};" + $env:Path`;
}

function dedupeWindowsPathEntries(entries: Array<string | undefined | null>): string[] {
  const orderedEntries: string[] = [];
  const seenEntries = new Set<string>();

  for (const entry of entries) {
    const trimmedEntry = entry?.trim();
    if (!trimmedEntry) {
      continue;
    }

    const normalizedEntry = trimmedEntry.toLowerCase();
    if (seenEntries.has(normalizedEntry)) {
      continue;
    }

    seenEntries.add(normalizedEntry);
    orderedEntries.push(trimmedEntry);
  }

  return orderedEntries;
}
