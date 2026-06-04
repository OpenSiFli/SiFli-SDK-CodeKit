import * as assert from 'assert';
import * as path from 'path';
import { describe, it } from 'mocha';
import { resolveMainMapPath } from '../utils/memoryMapPathUtils';
import { parseGnuMap } from '../utils/gnuMapParser';

const SAMPLE_MAP = `Archive member included to satisfy reference by file (symbol)

Discarded input sections

 .text          0x00000000      0x999 build/discarded.o

Memory Configuration

Name             Origin             Length             Attributes
ROM              0x08000000         0x00001000         xr
RAM              0x20000000         0x00000800         rw
*default*        0x00000000         0xffffffff

Linker script and memory map

.text           0x08000000      0x100
 *(.text*)
 .text.big_function
                0x08000000       0x80 build/main.o
                0x08000000                big_function
 .rodata.constant_table
                0x08000080       0x20 build/main.o
 *fill*         0x080000a0       0x60

.data           0x20000000       0x40 load address 0x08000100
 *(.data*)
 .data.big_data
                0x20000000       0x40 build/main.o
                0x20000000                big_data

.bss            0x20000040       0x80 load address 0x08000140
 *(.bss*)
 .bss.big_buffer
                0x20000040       0x80 build/main.o
                0x20000040                big_buffer

.debug_info     0x00000000      0xabc
 .debug_info    0x00000000      0xabc build/main.o

Cross Reference Table
`;

describe('gnuMapParser', () => {
  it('parses memory regions and summarizes runtime and load usage', () => {
    const snapshot = parseGnuMap(SAMPLE_MAP, {
      mapPath: '/tmp/build/main.map',
      parsedAt: '2026-01-01T00:00:00.000Z',
    });

    const rom = snapshot.regions.find(region => region.name === 'ROM');
    const ram = snapshot.regions.find(region => region.name === 'RAM');

    assert.ok(rom);
    assert.ok(ram);
    assert.strictEqual(rom.runtimeUsed, 0x100);
    assert.strictEqual(rom.loadUsed, 0x140);
    assert.strictEqual(ram.runtimeUsed, 0xc0);
    assert.strictEqual(ram.loadUsed, 0);
    assert.strictEqual(snapshot.totalRuntimeBytes, 0x1c0);
    assert.strictEqual(snapshot.totalLoadBytes, 0x140);
  });

  it('extracts symbol names from following symbol lines and falls back to section names', () => {
    const snapshot = parseGnuMap(SAMPLE_MAP, {
      mapPath: '/tmp/build/main.map',
      topSymbolLimit: 10,
    });

    const names = snapshot.topSymbols.map(symbol => symbol.name);
    assert.ok(names.includes('big_function'));
    assert.ok(names.includes('big_data'));
    assert.ok(names.includes('big_buffer'));
    assert.ok(names.includes('constant_table'));

    const data = snapshot.topSymbols.find(symbol => symbol.name === 'big_data');
    assert.ok(data);
    assert.strictEqual(data.section, '.data.big_data');
    assert.strictEqual(data.outputSection, '.data');
    assert.strictEqual(data.regionName, 'RAM');
    assert.strictEqual(data.line, 27);
  });

  it('skips discarded and debug sections', () => {
    const snapshot = parseGnuMap(SAMPLE_MAP, {
      mapPath: '/tmp/build/main.map',
      topSymbolLimit: 20,
    });

    assert.strictEqual(
      snapshot.topSymbols.some(symbol => symbol.objectPath.includes('discarded.o')),
      false
    );
    assert.strictEqual(
      snapshot.sections.some(section => section.name === '.debug_info'),
      false
    );
  });

  it('throws on non-GNU map content', () => {
    assert.throws(
      () => parseGnuMap('not a map file', { mapPath: '/tmp/main.map' }),
      /does not look like a GNU ld map file/
    );
  });
});

describe('memoryMapService helpers', () => {
  it('resolves main.map below the active build folder', () => {
    assert.strictEqual(
      resolveMainMapPath('/workspace/app', path.join('project', 'build_board_hcpu')),
      path.join('/workspace/app', 'project', 'build_board_hcpu', 'main.map')
    );
  });
});
