export function parseSerialHexInput(input: string): Buffer {
  const normalized = input.replace(/0x/gi, '').replace(/[\s,;:_-]/g, '');
  if (!normalized) {
    return Buffer.alloc(0);
  }
  if (/[^0-9a-fA-F]/.test(normalized)) {
    throw new Error('HEX input can only contain hexadecimal bytes.');
  }
  if (normalized.length % 2 !== 0) {
    throw new Error('HEX input must contain an even number of digits.');
  }
  return Buffer.from(normalized, 'hex');
}

export function formatSerialBufferHex(data: Buffer): string {
  return Array.from(data)
    .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}
