import * as assert from 'assert';
import { describe, it } from 'mocha';
import { resolvePsramRegions, resolvePsramWindowAddress } from '../peripheral-viewer/export/memoryWindowResolver';

describe('memoryWindowResolver', () => {
  it('resolves fixed PSRAM windows by model and mpi', () => {
    assert.strictEqual(resolvePsramWindowAddress('SF32LB52x', 'mpi1'), 0x60000000);
    assert.strictEqual(resolvePsramWindowAddress('SF32LB56x', 'mpi2'), 0x60800000);
    assert.strictEqual(resolvePsramWindowAddress('SF32LB58x', 'mpi2'), 0x62000000);
  });

  it('builds ordered PSRAM export regions for dual-PSRAM parts', () => {
    const regions = resolvePsramRegions({
      modelId: 'SF32LB58x',
      partNumber: 'SF32LB583VCC36',
      memories: [
        { mpi: 'mpi2', type: 'psram', size: 8388608 },
        { mpi: 'mpi1', type: 'psram', size: 8388608 },
      ],
    });

    assert.deepStrictEqual(regions, [
      {
        fileName: 'psram.bin',
        address: 0x60000000,
        size: 8388608,
        backingMpi: 'mpi1',
      },
      {
        fileName: 'psram2.bin',
        address: 0x62000000,
        size: 8388608,
        backingMpi: 'mpi2',
      },
    ]);
  });

  it('rejects unsupported PSRAM windows', () => {
    assert.throws(() => resolvePsramWindowAddress('SF32LB52X', 'mpi2'), /Unsupported PSRAM mapping/);
  });
});
