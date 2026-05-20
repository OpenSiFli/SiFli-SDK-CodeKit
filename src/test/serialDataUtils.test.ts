import * as assert from 'assert';
import { describe, it } from 'mocha';
import { formatSerialBufferHex, parseSerialHexInput } from '../utils/serialDataUtils';

describe('serialDataUtils', () => {
  it('parses separated hex bytes', () => {
    assert.deepStrictEqual(parseSerialHexInput('AA 55 0D 0A'), Buffer.from([0xaa, 0x55, 0x0d, 0x0a]));
  });

  it('parses 0x-prefixed and comma-separated bytes', () => {
    assert.deepStrictEqual(parseSerialHexInput('0x01, 0x02, 0xff'), Buffer.from([0x01, 0x02, 0xff]));
  });

  it('parses continuous hex strings', () => {
    assert.deepStrictEqual(parseSerialHexInput('48656c6c6f'), Buffer.from('Hello', 'utf8'));
  });

  it('rejects odd-length hex input', () => {
    assert.throws(() => parseSerialHexInput('ABC'), /even number/);
  });

  it('rejects non-hex characters', () => {
    assert.throws(() => parseSerialHexInput('GG'), /hexadecimal/);
  });

  it('formats buffers as uppercase byte pairs', () => {
    assert.strictEqual(formatSerialBufferHex(Buffer.from([0x00, 0x0a, 0xff])), '00 0A FF');
  });
});
