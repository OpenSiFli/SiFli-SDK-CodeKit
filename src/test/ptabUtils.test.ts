import * as assert from 'assert';
import { describe, it } from 'mocha';
import {
  buildPartitionPatchFromDraft,
  getBaseBoardName,
  isSupportedPtabSdkBranch,
  normalizePtabBoardName,
  resolvePtabSourceMode,
  upsertPartitionItems,
} from '../utils/ptabUtils';

describe('ptabUtils', () => {
  it('allows only supported SDK branches for PTAB v3 visualization', () => {
    assert.strictEqual(isSupportedPtabSdkBranch('main'), true);
    assert.strictEqual(isSupportedPtabSdkBranch('release/v2.5'), true);
    assert.strictEqual(isSupportedPtabSdkBranch('release/v2.4'), false);
    assert.strictEqual(isSupportedPtabSdkBranch('v2.5.0'), false);
    assert.strictEqual(isSupportedPtabSdkBranch(undefined), false);
  });

  it('normalizes board names to the SDK ptab core suffix convention', () => {
    assert.strictEqual(normalizePtabBoardName('sf32lb52-lcd_n16r8'), 'sf32lb52-lcd_n16r8_hcpu');
    assert.strictEqual(normalizePtabBoardName('sf32lb52-lcd_n16r8_HCPU'), 'sf32lb52-lcd_n16r8_hcpu');
    assert.strictEqual(getBaseBoardName('sf32lb52-lcd_n16r8_hcpu'), 'sf32lb52-lcd_n16r8');
  });

  it('resolves effective PTAB source mode from project and overlay state', () => {
    assert.strictEqual(resolvePtabSourceMode({ projectFullPtab: '/tmp/ptab.yaml', usesOverlay: true }), 'project_full');
    assert.strictEqual(resolvePtabSourceMode({ usesOverlay: true }), 'overlay');
    assert.strictEqual(resolvePtabSourceMode({ usesOverlay: false }), 'board');
  });

  it('builds overlay patches with explicit operations', () => {
    const patch = buildPartitionPatchFromDraft(
      {
        originalName: 'fs_region',
        name: 'fs_region',
        operation: 'override',
        type: 'data',
        subtype: 'filesystem',
        region: 'mpi2',
        offset: '0x100000',
        size: '4MB',
      },
      'project_overlay'
    );

    assert.strictEqual(patch.name, 'fs_region');
    assert.strictEqual(patch.op, 'override');
    assert.strictEqual(patch.size, '4MB');
  });

  it('keeps overlay override patches minimal when an original partition is available', () => {
    const patch = buildPartitionPatchFromDraft(
      {
        originalName: 'fs_region',
        name: 'fs_region',
        operation: 'override',
        type: 'data',
        subtype: 'filesystem',
        region: 'mpi2',
        offset: '0x100000',
        size: '5MB',
      },
      'project_overlay',
      {
        name: 'fs_region',
        type: 'data',
        subtype: 'filesystem',
        region: 'mpi2',
        offset: '0x100000',
        offset_bytes: 0x100000,
        offset_hex: '0x00100000',
        end_offset: 0x500000,
        end_offset_hex: '0x00500000',
        size: '4MB',
        size_bytes: 4 * 1024 * 1024,
        size_hex: '0x00400000',
      }
    );

    assert.deepStrictEqual(patch, {
      name: 'fs_region',
      op: 'override',
      size: '5MB',
    });
  });

  it('omits overlay operations when writing full ptab files', () => {
    const patch = buildPartitionPatchFromDraft(
      {
        originalName: 'fs_region',
        name: 'fs_region',
        operation: 'override',
        type: 'data',
        subtype: 'filesystem',
        region: 'mpi2',
        offset: '0x100000',
        size: '4MB',
      },
      'project_full'
    );

    assert.strictEqual(Object.prototype.hasOwnProperty.call(patch, 'op'), false);
  });

  it('forces drafts without an original partition to overlay add operations', () => {
    const patch = buildPartitionPatchFromDraft(
      {
        name: 'kvdb_new',
        operation: 'override',
        type: 'data',
        subtype: 'flashdb_kv',
        region: 'mpi2',
        offset: '128KB',
        size: '64KB',
        execRegion: '',
        execOffset: '',
      },
      'project_overlay'
    );

    assert.deepStrictEqual(patch, {
      name: 'kvdb_new',
      op: 'add',
      type: 'data',
      subtype: 'flashdb_kv',
      region: 'mpi2',
      offset: '128KB',
      size: '64KB',
    });
  });

  it('appends overlay add patches without matching an existing partition', () => {
    const result = upsertPartitionItems(
      [
        {
          name: 'hcpu_flash_code',
          op: 'override',
          size: '4MB',
        },
      ],
      [
        {
          name: 'kvdb_new',
          op: 'add',
          type: 'data',
          subtype: 'flashdb_kv',
          region: 'mpi2',
          offset: '128KB',
          size: '64KB',
        },
      ],
      true
    );

    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[1], {
      name: 'kvdb_new',
      op: 'add',
      type: 'data',
      subtype: 'flashdb_kv',
      region: 'mpi2',
      offset: '128KB',
      size: '64KB',
    });
  });

  it('upserts by original name so full ptab edits can rename a partition', () => {
    const result = upsertPartitionItems(
      [
        {
          name: 'old_name',
          type: 'data',
          region: 'mpi2',
          offset: '0',
          size: '64KB',
        },
      ],
      [
        {
          __matchName: 'old_name',
          name: 'new_name',
          type: 'data',
          region: 'mpi2',
          offset: '0',
          size: '128KB',
        },
      ],
      false
    );

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'new_name');
    assert.strictEqual(result[0].size, '128KB');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result[0], '__matchName'), false);
  });
});
