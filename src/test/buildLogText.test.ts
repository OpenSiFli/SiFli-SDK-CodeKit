import * as assert from 'assert';
import { describe, it } from 'mocha';
import { formatBuildLogText } from '../utils/buildLogText';

describe('buildLogText', () => {
  it('joins single-line log messages in order', () => {
    const text = formatBuildLogText([{ message: 'first line' }, { message: 'second line' }]);

    assert.strictEqual(text, 'first line\nsecond line');
  });

  it('preserves multi-line messages while normalizing newlines', () => {
    const text = formatBuildLogText([{ message: 'first\r\nsecond\rthird' }]);

    assert.strictEqual(text, 'first\nsecond\nthird');
  });

  it('strips ANSI escape sequences from messages', () => {
    const text = formatBuildLogText([{ message: '\x1b[31merror\x1b[0m and \x1b[33mwarning\x1b[0m' }]);

    assert.strictEqual(text, 'error and warning');
  });

  it('returns an empty string for empty logs', () => {
    assert.strictEqual(formatBuildLogText([]), '');
  });
});
