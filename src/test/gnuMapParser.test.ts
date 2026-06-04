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
    assert.strictEqual(data.line, 29);
  });

  it('handles GNU ld output sections whose address is wrapped onto the next line', () => {
    const wrappedMap = `Memory Configuration

Name             Origin             Length             Attributes
ROM              0x08000000         0x00001000         xr
RAM              0x20000000         0x00001000         rw

Linker script and memory map

.text           0x08000000      0x10
 .text.foo      0x08000000      0x10 build/foo.o

.long_output_section_name_that_wraps
                0x20000000      0x20 load address 0x08000010
 .data.bar      0x20000000      0x20 build/bar.o
                0x20000000                bar
`;

    const snapshot = parseGnuMap(wrappedMap, {
      mapPath: '/tmp/build/main.map',
      topSymbolLimit: 10,
    });

    const wrappedSection = snapshot.sections.find(section => section.name === '.long_output_section_name_that_wraps');
    const rom = snapshot.regions.find(region => region.name === 'ROM');
    const ram = snapshot.regions.find(region => region.name === 'RAM');
    const bar = snapshot.topSymbols.find(symbol => symbol.name === 'bar');

    assert.ok(wrappedSection);
    assert.strictEqual(wrappedSection.regionName, 'RAM');
    assert.strictEqual(wrappedSection.loadRegionName, 'ROM');
    assert.strictEqual(rom?.loadUsed, 0x30);
    assert.strictEqual(ram?.runtimeUsed, 0x20);
    assert.strictEqual(bar?.outputSection, '.long_output_section_name_that_wraps');
  });

  it('splits an input section into inferred symbol-sized entries when multiple symbol lines are present', () => {
    const multiSymbolMap = `Memory Configuration

Name             Origin             Length             Attributes
ROM              0x08000000         0x00001000         xr

Linker script and memory map

.text           0x08000000      0x30
 .text.bundle   0x08000000      0x30 build/bundle.o
                0x08000000                first_symbol
                0x08000008                $t
                0x08000010                second_symbol
                0x08000028                third_symbol
`;

    const snapshot = parseGnuMap(multiSymbolMap, {
      mapPath: '/tmp/build/main.map',
      topSymbolLimit: 10,
    });

    const first = snapshot.topSymbols.find(symbol => symbol.name === 'first_symbol');
    const second = snapshot.topSymbols.find(symbol => symbol.name === 'second_symbol');
    const third = snapshot.topSymbols.find(symbol => symbol.name === 'third_symbol');

    assert.strictEqual(first?.size, 0x10);
    assert.strictEqual(second?.size, 0x18);
    assert.strictEqual(third?.size, 0x08);
    assert.strictEqual(
      snapshot.topSymbols.some(symbol => symbol.name === '$t'),
      false
    );
  });

  it('keeps leading bytes when an input section starts with filtered ARM mapping symbols', () => {
    const leadingMappingMap = `Memory Configuration

Name             Origin             Length             Attributes
ROM              0x08000000         0x00001000         xr

Linker script and memory map

.text           0x08000000      0x20
 .text.bundle   0x08000000      0x20 build/bundle.o
                0x08000000                $t
                0x08000008                real_function
                0x08000018                next_function
`;

    const snapshot = parseGnuMap(leadingMappingMap, {
      mapPath: '/tmp/build/main.map',
      topSymbolLimit: 10,
    });

    const realFunction = snapshot.topSymbols.find(symbol => symbol.name === 'real_function');
    const nextFunction = snapshot.topSymbols.find(symbol => symbol.name === 'next_function');

    assert.strictEqual(realFunction?.address, 0x08000000);
    assert.strictEqual(realFunction?.size, 0x18);
    assert.strictEqual(nextFunction?.size, 0x08);
    assert.strictEqual(
      snapshot.topSymbols.some(symbol => symbol.name === '$t'),
      false
    );
  });

  it('combines same-address symbol aliases without double-counting their size', () => {
    const aliasMap = `Memory Configuration

Name             Origin             Length             Attributes
ROM              0x08000000         0x00001000         xr

Linker script and memory map

.text           0x08000000      0x20
 .text.aliases  0x08000000      0x20 build/aliases.o
                0x08000000                primary_symbol
                0x08000000                alias_symbol
                0x08000010                tail_symbol
`;

    const snapshot = parseGnuMap(aliasMap, {
      mapPath: '/tmp/build/main.map',
      topSymbolLimit: 10,
    });

    const alias = snapshot.topSymbols.find(symbol => symbol.name === 'primary_symbol / alias_symbol');
    const tail = snapshot.topSymbols.find(symbol => symbol.name === 'tail_symbol');

    assert.strictEqual(alias?.size, 0x10);
    assert.strictEqual(tail?.size, 0x10);
    assert.strictEqual(snapshot.topSymbols.filter(symbol => symbol.address === 0x08000000).length, 1);
  });

  it('includes allocated sections that start at address zero', () => {
    const zeroOriginMap = `Memory Configuration

Name             Origin             Length             Attributes
ROM              0x00000000         0x00000100         xr

Linker script and memory map

.vectors        0x00000000      0x20
 .vectors       0x00000000      0x20 build/startup.o
                0x00000000                reset_vectors
`;

    const snapshot = parseGnuMap(zeroOriginMap, {
      mapPath: '/tmp/build/main.map',
      topSymbolLimit: 10,
    });

    const rom = snapshot.regions.find(region => region.name === 'ROM');
    const vectors = snapshot.sections.find(section => section.name === '.vectors');
    const resetVectors = snapshot.topSymbols.find(symbol => symbol.name === 'reset_vectors');

    assert.strictEqual(rom?.runtimeUsed, 0x20);
    assert.strictEqual(rom?.loadUsed, 0x20);
    assert.strictEqual(vectors?.address, 0);
    assert.strictEqual(vectors?.size, 0x20);
    assert.strictEqual(resetVectors?.address, 0);
    assert.strictEqual(resetVectors?.size, 0x20);
  });

  it('includes non-dot input sections such as COMMON allocations', () => {
    const commonMap = `Memory Configuration

Name             Origin             Length             Attributes
RAM              0x20000000         0x00001000         rw

Linker script and memory map

.bss            0x20000000      0x20
 *(COMMON)
 COMMON         0x20000000      0x20 build/common.o
`;

    const snapshot = parseGnuMap(commonMap, {
      mapPath: '/tmp/build/main.map',
      topSymbolLimit: 10,
    });

    const common = snapshot.topSymbols.find(symbol => symbol.section === 'COMMON');
    assert.ok(common);
    assert.strictEqual(common.name, 'COMMON (common.o)');
    assert.strictEqual(common.size, 0x20);
    assert.strictEqual(common.regionName, 'RAM');
  });

  it('splits section usage across memory regions and warns about unknown load ranges', () => {
    const crossingMap = `Memory Configuration

Name             Origin             Length             Attributes
LOW              0x00001000         0x00000010         rw
HIGH             0x00001010         0x00000010         rw

Linker script and memory map

.text           0x00001008      0x18 load address 0x00002000
 .text.cross    0x00001008      0x18 build/cross.o
`;

    const snapshot = parseGnuMap(crossingMap, {
      mapPath: '/tmp/build/main.map',
    });

    const low = snapshot.regions.find(region => region.name === 'LOW');
    const high = snapshot.regions.find(region => region.name === 'HIGH');
    const lowSection = snapshot.sections.find(section => section.name === '.text' && section.regionName === 'LOW');
    const highSection = snapshot.sections.find(section => section.name === '.text' && section.regionName === 'HIGH');

    assert.strictEqual(low?.runtimeUsed, 0x08);
    assert.strictEqual(high?.runtimeUsed, 0x10);
    assert.strictEqual(lowSection?.size, 0x08);
    assert.strictEqual(highSection?.size, 0x10);
    assert.strictEqual(
      snapshot.sections.some(
        section => section.name === '.text' && section.regionName === 'LOW' && section.size === 0x18
      ),
      false
    );
    assert.ok(snapshot.warnings.some(warning => warning.includes('spans multiple memory regions')));
    assert.ok(snapshot.warnings.some(warning => warning.includes('Load address for section .text')));
  });

  it('splits section entries when the load address crosses memory regions', () => {
    const crossingLoadMap = `Memory Configuration

Name             Origin             Length             Attributes
ROM_A            0x08000000         0x00000010         xr
ROM_B            0x08000010         0x00000020         xr
RAM              0x20000000         0x00000100         rw

Linker script and memory map

.data           0x20000000      0x20 load address 0x08000008
 .data.payload  0x20000000      0x20 build/payload.o
`;

    const snapshot = parseGnuMap(crossingLoadMap, {
      mapPath: '/tmp/build/main.map',
    });

    const romA = snapshot.regions.find(region => region.name === 'ROM_A');
    const romB = snapshot.regions.find(region => region.name === 'ROM_B');
    const dataInRomA = snapshot.sections.find(
      section => section.name === '.data' && section.loadRegionName === 'ROM_A'
    );
    const dataInRomB = snapshot.sections.find(
      section => section.name === '.data' && section.loadRegionName === 'ROM_B'
    );

    assert.strictEqual(romA?.loadUsed, 0x08);
    assert.strictEqual(romB?.loadUsed, 0x18);
    assert.strictEqual(dataInRomA?.regionName, 'RAM');
    assert.strictEqual(dataInRomA?.size, 0x08);
    assert.strictEqual(dataInRomA?.loadAddress, 0x08000008);
    assert.strictEqual(dataInRomB?.regionName, 'RAM');
    assert.strictEqual(dataInRomB?.size, 0x18);
    assert.strictEqual(dataInRomB?.loadAddress, 0x08000010);
  });

  it('splits symbol entries on load-region boundaries to match section fragments', () => {
    const crossingLoadSymbolMap = `Memory Configuration

Name             Origin             Length             Attributes
ROM_A            0x08000000         0x00000010         xr
ROM_B            0x08000010         0x00000020         xr
RAM              0x20000000         0x00000100         rw

Linker script and memory map

.data           0x20000000      0x20 load address 0x08000008
 .data.payload  0x20000000      0x20 build/payload.o
                0x20000000                payload
`;

    const snapshot = parseGnuMap(crossingLoadSymbolMap, {
      mapPath: '/tmp/build/main.map',
      topSymbolLimit: 10,
    });

    const payloadFragments = snapshot.topSymbols.filter(symbol => symbol.name === 'payload');

    assert.strictEqual(payloadFragments.length, 2);
    assert.strictEqual(payloadFragments[0].address, 0x20000008);
    assert.strictEqual(payloadFragments[0].size, 0x18);
    assert.strictEqual(payloadFragments[1].address, 0x20000000);
    assert.strictEqual(payloadFragments[1].size, 0x08);
  });

  it('does not treat linker script commands as non-dot input sections', () => {
    const scriptCommandMap = `Memory Configuration

Name             Origin             Length             Attributes
ROM              0x08000000         0x00001000         xr

Linker script and memory map

.vectors        0x08000000      0x04
 KEEP(*(.isr_vector))
                0x08000000      0x04 LONG 0x12345678

.generated      0x08000004      0x04
 .generated_blob
                0x08000004      0x04 QUAD 0x00000000
`;

    const snapshot = parseGnuMap(scriptCommandMap, {
      mapPath: '/tmp/build/main.map',
      topSymbolLimit: 10,
    });

    assert.strictEqual(snapshot.sections.length, 2);
    assert.strictEqual(snapshot.topSymbols.length, 0);
  });

  it('does not reject object paths that begin with generated-data directive words', () => {
    const directiveWordPathMap = `Memory Configuration

Name             Origin             Length             Attributes
ROM              0x08000000         0x00001000         xr

Linker script and memory map

.text           0x08000000      0x30
 .text.long     0x08000000      0x10 long.o
 .text.fill     0x08000010      0x10 fill.obj
 .text.nested   0x08000020      0x10 long/foo.o
`;

    const snapshot = parseGnuMap(directiveWordPathMap, {
      mapPath: '/tmp/build/main.map',
      topSymbolLimit: 10,
    });

    const objectPaths = snapshot.topSymbols.map(symbol => symbol.objectPath);

    assert.ok(objectPaths.includes('long.o'));
    assert.ok(objectPaths.includes('fill.obj'));
    assert.ok(objectPaths.includes('long/foo.o'));
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
