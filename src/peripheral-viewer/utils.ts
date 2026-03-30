/*
 * Copyright 2017-2019 Marcel Ball
 * https://github.com/Marus/cortex-debug
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without
 * limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

export function hexFormat(value: number, padding = 8, includePrefix = true): string {
  let base = (value >>> 0).toString(16);
  base = base.padStart(padding, '0');
  return includePrefix ? '0x' + base : base;
}

export function binaryFormat(value: number, padding = 0, includePrefix = true, group = false): string {
  let base = (value >>> 0).toString(2);
  while (base.length < padding) {
    base = '0' + base;
  }

  if (group) {
    const nibRem = 4 - (base.length % 4);
    for (let i = 0; i < nibRem; i++) {
      base = '0' + base;
    }
    const groups = base.match(/[01]{4}/g);
    if (groups) {
      base = groups.join(' ');
    }

    base = base.substring(nibRem);
  }

  return includePrefix ? '0b' + base : base;
}

export function createMask(offset: number, width: number): number {
  let r = 0;
  const a = offset;
  const b = offset + width - 1;
  for (let i = a; i <= b; i++) {
    r = (r | (1 << i)) >>> 0;
  }
  return r;
}

export function extractBits(value: number, offset: number, width: number): number {
  const mask = createMask(offset, width);
  const bvalue = ((value & mask) >>> offset) >>> 0;
  return bvalue;
}

export function parseInteger(value: string): number | undefined {
  if (value) {
    value = value.toLowerCase();
    if (/^0b([01]+)$/i.test(value)) {
      return parseInt(value.substring(2), 2);
    } else if (/^0x([0-9a-f]+)$/i.test(value)) {
      return parseInt(value.substring(2), 16);
    } else if (/^[0-9]+/i.test(value)) {
      return parseInt(value, 10);
    } else if (/^#[0-1]+/i.test(value)) {
      return parseInt(value.substring(1), 2);
    }
  }

  return undefined;
}

export function parseDimIndex(spec: string, count: number): string[] {
  if (spec.indexOf(',') !== -1) {
    const components = spec.split(',').map(c => c.trim());
    if (components.length !== count) {
      throw new Error('dimIndex Element has invalid specification.');
    }
    return components;
  }

  if (/^([0-9]+)-([0-9]+)$/i.test(spec)) {
    const parts = spec.split('-').map(p => parseInteger(p));
    const start = parts[0];
    const end = parts[1];

    if (start === undefined || end === undefined) {
      return [];
    }
    if (start < 0 || end < 0 || end < start) {
      throw new Error('dimIndex Element Range Spec invalid.');
    }
    const numElements = end - start + 1;
    if (numElements < count) {
      throw new Error('dimIndex Element has invalid specification.');
    }

    const components: string[] = [];
    for (let i = 0; i < count; i++) {
      components.push(`${start + i}`);
    }

    return components;
  }

  if (/^[a-zA-Z]-[a-zA-Z]$/.test(spec)) {
    const start = spec.charCodeAt(0);
    const end = spec.charCodeAt(2);

    const numElements = end - start + 1;
    if (numElements < count) {
      throw new Error('dimIndex Element has invalid specification.');
    }

    const components: string[] = [];
    for (let i = 0; i < count; i++) {
      components.push(String.fromCharCode(start + i));
    }

    return components;
  }

  return [];
}

export const readFromUrl = async (url: string): Promise<ArrayBuffer | undefined> => {
  // Download using fetch
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    const msg = `Request to ${url} failed. Status="${response.status}". Body="${body}".`;
    throw new Error(msg);
  }

  const buffer = await response.arrayBuffer();
  return buffer;
};
