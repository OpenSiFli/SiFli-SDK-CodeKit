import * as assert from 'assert';
import * as path from 'path';
import { describe, it } from 'mocha';
import { ChipCatalogService } from '../peripheral-viewer/export/chipCatalogService';

const projectRoot = path.resolve(__dirname, '../..');

describe('ChipCatalogService', () => {
  it('lists exact part numbers from SiliconSchema', () => {
    const service = new ChipCatalogService(projectRoot);
    const options = service.listChipOptions();

    const option = options.find(entry => entry.partNumber === 'SF32LB566VCB36');
    assert.ok(option);
    assert.strictEqual(option?.modelId, 'SF32LB56x');
    assert.strictEqual(option?.psramCount, 2);
    assert.strictEqual(option?.psramSummary, 'MPI1 8MB, MPI2 4MB');
  });

  it('returns chip definitions with exact memory bindings', () => {
    const service = new ChipCatalogService(projectRoot);
    const chip = service.getChipDefinition('SF32LB583VCC36');

    assert.ok(chip);
    assert.strictEqual(chip?.modelId, 'SF32LB58x');
    assert.deepStrictEqual(
      chip?.memories.filter(memory => memory.type === 'psram'),
      [
        { mpi: 'mpi1', type: 'psram', size: 8388608 },
        { mpi: 'mpi2', type: 'psram', size: 8388608 },
      ]
    );
  });
});
