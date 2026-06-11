import * as assert from 'assert';
import { describe, it } from 'mocha';
import { buildSftoolStubArgs, quoteSftoolCommandArg } from '../utils/sftoolCommandUtils';

describe('sftoolCommandUtils', () => {
  it('omits stub arguments when no stub settings are configured', () => {
    assert.strictEqual(buildSftoolStubArgs({}), '');
    assert.strictEqual(buildSftoolStubArgs({ stubPath: '', stubConfigPath: '   ' }), '');
  });

  it('builds an external stub bin argument', () => {
    assert.strictEqual(buildSftoolStubArgs({ stubPath: '/tmp/custom stub.bin' }), '--stub "/tmp/custom stub.bin"');
  });

  it('builds a stub_config JSON argument', () => {
    assert.strictEqual(
      buildSftoolStubArgs({ stubConfigPath: '/tmp/stub config.json' }),
      '--stub-config "/tmp/stub config.json"'
    );
  });

  it('keeps stub arguments before the command when both are configured', () => {
    assert.strictEqual(
      buildSftoolStubArgs({
        stubPath: '/tmp/custom stub.bin',
        stubConfigPath: '/tmp/stub config.json',
      }),
      '--stub "/tmp/custom stub.bin" --stub-config "/tmp/stub config.json"'
    );
  });

  it('escapes Unix shell interpolation characters inside quoted arguments', () => {
    assert.strictEqual(
      quoteSftoolCommandArg('/tmp/$SDK/`stub`/"ram".bin', 'linux'),
      '"/tmp/\\$SDK/\\`stub\\`/\\"ram\\".bin"'
    );
  });

  it('escapes PowerShell interpolation characters inside quoted arguments', () => {
    assert.strictEqual(
      quoteSftoolCommandArg('C:\\SDK\\$stub\\`tick"ram.bin', 'win32'),
      '"C:\\SDK\\`$stub\\``tick`"ram.bin"'
    );
  });
});
