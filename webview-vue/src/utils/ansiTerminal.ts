export interface AnsiRenderSegment {
  text: string;
  className: string;
  style: Record<string, string>;
}

export interface RenderedAnsiEntry<T> {
  entry: T;
  segments: AnsiRenderSegment[];
}

interface AnsiState {
  foreground?: string;
  background?: string;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
}

const ANSI_BASIC_COLORS = ['#1f2937', '#ef4444', '#22c55e', '#eab308', '#3b82f6', '#d946ef', '#06b6d4', '#e5e7eb'];

const ANSI_BRIGHT_COLORS = ['#6b7280', '#f87171', '#4ade80', '#fde047', '#60a5fa', '#e879f9', '#22d3ee', '#ffffff'];

function createInitialState(): AnsiState {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    inverse: false,
  };
}

export function renderAnsiEntries<T extends { text: string; source?: string }>(
  entries: T[],
  renderAnsi: boolean
): Array<RenderedAnsiEntry<T>> {
  const state = createInitialState();
  return entries.map(entry => ({
    entry,
    segments: renderAnsi
      ? parseAnsiSegments(entry.text, state, sourceClass(entry.source))
      : plainSegments(stripAnsiControlSequences(entry.text), sourceClass(entry.source)),
  }));
}

export function stripAnsiControlSequences(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b[@-_][0-?]*[ -/]*[@-~]?/g, '');
}

function plainSegments(text: string, className: string): AnsiRenderSegment[] {
  return text ? [{ text, className, style: {} }] : [];
}

function parseAnsiSegments(text: string, state: AnsiState, className: string): AnsiRenderSegment[] {
  const segments: AnsiRenderSegment[] = [];
  let index = 0;

  while (index < text.length) {
    const escapeIndex = text.indexOf('\x1b', index);
    if (escapeIndex === -1) {
      pushSegment(segments, text.slice(index), state, className);
      break;
    }

    pushSegment(segments, text.slice(index, escapeIndex), state, className);

    if (text[escapeIndex + 1] !== '[') {
      index = Math.min(text.length, escapeIndex + 2);
      continue;
    }

    const sequenceEnd = findCsiEnd(text, escapeIndex + 2);
    if (sequenceEnd === -1) {
      break;
    }

    if (text[sequenceEnd] === 'm') {
      applySgr(state, text.slice(escapeIndex + 2, sequenceEnd));
    }
    index = sequenceEnd + 1;
  }

  return segments;
}

function findCsiEnd(text: string, start: number): number {
  for (let index = start; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) {
      return index;
    }
  }
  return -1;
}

function pushSegment(segments: AnsiRenderSegment[], text: string, state: AnsiState, className: string): void {
  if (!text) {
    return;
  }
  segments.push({
    text,
    className,
    style: styleFromState(state),
  });
}

function applySgr(state: AnsiState, params: string): void {
  const codes = params.length === 0 ? [0] : params.split(';').map(value => Number(value || 0));
  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index];
    if (!Number.isFinite(code)) {
      continue;
    }

    if (code === 0) {
      Object.assign(state, createInitialState());
    } else if (code === 1) {
      state.bold = true;
    } else if (code === 2) {
      state.dim = true;
    } else if (code === 3) {
      state.italic = true;
    } else if (code === 4) {
      state.underline = true;
    } else if (code === 7) {
      state.inverse = true;
    } else if (code === 22) {
      state.bold = false;
      state.dim = false;
    } else if (code === 23) {
      state.italic = false;
    } else if (code === 24) {
      state.underline = false;
    } else if (code === 27) {
      state.inverse = false;
    } else if (code === 39) {
      state.foreground = undefined;
    } else if (code === 49) {
      state.background = undefined;
    } else if (code >= 30 && code <= 37) {
      state.foreground = ANSI_BASIC_COLORS[code - 30];
    } else if (code >= 90 && code <= 97) {
      state.foreground = ANSI_BRIGHT_COLORS[code - 90];
    } else if (code >= 40 && code <= 47) {
      state.background = ANSI_BASIC_COLORS[code - 40];
    } else if (code >= 100 && code <= 107) {
      state.background = ANSI_BRIGHT_COLORS[code - 100];
    } else if (code === 38 || code === 48) {
      const resolved = resolveExtendedColor(codes, index + 1);
      if (resolved) {
        if (code === 38) {
          state.foreground = resolved.color;
        } else {
          state.background = resolved.color;
        }
        index = resolved.nextIndex;
      }
    }
  }
}

function resolveExtendedColor(codes: number[], modeIndex: number): { color: string; nextIndex: number } | undefined {
  const mode = codes[modeIndex];
  if (mode === 5) {
    const color = colorFrom256(codes[modeIndex + 1]);
    return color ? { color, nextIndex: modeIndex + 1 } : undefined;
  }
  if (mode === 2) {
    const red = clampColor(codes[modeIndex + 1]);
    const green = clampColor(codes[modeIndex + 2]);
    const blue = clampColor(codes[modeIndex + 3]);
    if (red === undefined || green === undefined || blue === undefined) {
      return undefined;
    }
    return { color: `rgb(${red}, ${green}, ${blue})`, nextIndex: modeIndex + 3 };
  }
  return undefined;
}

function colorFrom256(value: number): string | undefined {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    return undefined;
  }
  if (value < 8) {
    return ANSI_BASIC_COLORS[value];
  }
  if (value < 16) {
    return ANSI_BRIGHT_COLORS[value - 8];
  }
  if (value >= 232) {
    const level = 8 + (value - 232) * 10;
    return `rgb(${level}, ${level}, ${level})`;
  }

  const colorIndex = value - 16;
  const red = Math.floor(colorIndex / 36);
  const green = Math.floor((colorIndex % 36) / 6);
  const blue = colorIndex % 6;
  return `rgb(${cubeLevel(red)}, ${cubeLevel(green)}, ${cubeLevel(blue)})`;
}

function cubeLevel(value: number): number {
  return value === 0 ? 0 : 55 + value * 40;
}

function clampColor(value: number): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(255, Math.max(0, Math.round(value)));
}

function styleFromState(state: AnsiState): Record<string, string> {
  const style: Record<string, string> = {};
  const foreground = state.inverse ? (state.background ?? 'var(--vscode-editor-background)') : state.foreground;
  const background = state.inverse ? (state.foreground ?? 'var(--vscode-editor-foreground)') : state.background;

  if (foreground) {
    style.color = foreground;
  }
  if (background) {
    style.backgroundColor = background;
  }
  if (state.bold) {
    style.fontWeight = '700';
  }
  if (state.dim) {
    style.opacity = '0.72';
  }
  if (state.italic) {
    style.fontStyle = 'italic';
  }
  if (state.underline) {
    style.textDecoration = 'underline';
  }
  return style;
}

function sourceClass(source?: string): string {
  if (source === 'user' || source === 'mcp') {
    return 'terminal-source-tx';
  }
  if (source === 'error') {
    return 'terminal-source-error';
  }
  if (source === 'system') {
    return 'terminal-source-system';
  }
  return '';
}
