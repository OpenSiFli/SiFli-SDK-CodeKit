import * as assert from 'assert';
import { describe, it } from 'mocha';
import { SnapshotTemplateRegistry } from '../peripheral-viewer/export/snapshotTemplateRegistry';

describe('SnapshotTemplateRegistry', () => {
  it('provides exact templates for supported part numbers', () => {
    const registry = new SnapshotTemplateRegistry();
    const template = registry.getTemplate('SF32LB583VCC36');

    assert.ok(template);
    const fileNames = template?.items.map(item => item.fileName) ?? [];
    assert.ok(fileNames.includes('systick.bin'));
    assert.ok(fileNames.includes('scb.bin'));
    assert.ok(fileNames.includes('mpi1.bin'));
    assert.ok(fileNames.includes('mpi2.bin'));
    assert.ok(fileNames.includes('gpio1_reg.bin'));
  });

  it('marks 58x MPI defaults as SVD-backed', () => {
    const registry = new SnapshotTemplateRegistry();
    const template = registry.getTemplate('SF32LB587VEE56');
    const mpi1 = template?.items.find(item => item.fileName === 'mpi1.bin');
    const mpi2 = template?.items.find(item => item.fileName === 'mpi2.bin');

    assert.ok(mpi1);
    assert.ok(mpi2);
    assert.strictEqual(mpi1?.kind, 'registerBlock');
    assert.strictEqual(mpi2?.kind, 'registerBlock');
    assert.strictEqual(mpi1?.sourceType, 'svdPeripheral');
    assert.strictEqual(mpi2?.sourceType, 'svdPeripheral');
  });

  it('uses SVD-backed defaults for common register blocks', () => {
    const registry = new SnapshotTemplateRegistry();
    const template52 = registry.getTemplate('SF32LB523UB6');
    const template56 = registry.getTemplate('SF32LB561UBN26');

    const hpsysRcc52 = template52?.items.find(item => item.fileName === 'hpsys_rcc.bin');
    const pmu56 = template56?.items.find(item => item.fileName === 'pmu.bin');

    assert.ok(hpsysRcc52);
    assert.ok(pmu56);
    if (!hpsysRcc52 || hpsysRcc52.kind !== 'registerBlock') {
      assert.fail('hpsys_rcc.bin should be a register block');
    }
    if (!pmu56 || pmu56.kind !== 'registerBlock') {
      assert.fail('pmu.bin should be a register block');
    }
    assert.strictEqual(hpsysRcc52.sourceType, 'svdPeripheral');
    assert.strictEqual(pmu56.sourceType, 'svdPeripheral');
  });

  it('keeps only unsupported register blocks as fixed-address exceptions', () => {
    const registry = new SnapshotTemplateRegistry();
    const template = registry.getTemplate('SF32LB52DUB6');

    const rfMem = template?.items.find(item => item.fileName === 'rf_mem.bin');
    const phy = template?.items.find(item => item.fileName === 'phy.bin');

    assert.ok(rfMem);
    assert.ok(phy);
    if (!rfMem || rfMem.kind !== 'registerBlock') {
      assert.fail('rf_mem.bin should be a register block');
    }
    if (!phy || phy.kind !== 'registerBlock') {
      assert.fail('phy.bin should be a register block');
    }
    assert.strictEqual(rfMem.sourceType, 'fixedAddress');
    assert.strictEqual(phy.sourceType, 'fixedAddress');
  });

  it('does not fall back for unknown part numbers', () => {
    const registry = new SnapshotTemplateRegistry();
    assert.strictEqual(registry.getTemplate('SF32LB56x'), undefined);
  });
});
