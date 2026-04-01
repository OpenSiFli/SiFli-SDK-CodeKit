/*
 * Copyright 2017-2019 Marcel Ball
 * https://github.com/Marus/cortex-debug
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without
 * limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { PeripheralRegisterNode } from './views/nodes/peripheralregisternode';
import { PeripheralClusterNode, PeripheralOrClusterNode } from './views/nodes/peripheralclusternode';
import { PeripheralFieldNode, EnumerationMap, EnumeratedValue } from './views/nodes/peripheralfieldnode';
import { PeripheralNode } from './views/nodes/peripheralnode';
import { parseInteger, parseDimIndex } from './utils';

export enum AccessType {
  ReadOnly = 1,
  ReadWrite,
  WriteOnly,
}

const accessTypeFromString = (type: string): AccessType => {
  switch (type) {
    case 'write-only':
    case 'writeOnce': {
      return AccessType.WriteOnly;
    }
    case 'read-write':
    case 'read-writeOnce': {
      return AccessType.ReadWrite;
    }
    // case 'read-only',
    default: {
      return AccessType.ReadOnly;
    }
  }
};

export interface Peripheral {
  name: string[];
}

export interface Device {
  name?: string[];
  resetValue: string[];
  size: string[];
  access: string[];
  peripherals: {
    peripheral: Peripheral[];
  }[];
}

export interface SvdData {
  device: Device;
}

export class SVDParser {
  private enumTypeValuesMap: { [key: string]: EnumerationMap } = {};
  private peripheralRegisterMap: { [key: string]: any } = {};
  private gapThreshold = 16;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor() {}

  public async parseSVD(svdData: SvdData, gapThreshold: number): Promise<PeripheralNode[]> {
    this.gapThreshold = gapThreshold;
    this.enumTypeValuesMap = {};
    this.peripheralRegisterMap = {};

    const peripheralMap: { [key: string]: any } = {};
    const defaultOptions = {
      accessType: AccessType.ReadWrite,
      size: 32,
      resetValue: 0x0,
    };

    if (svdData.device.resetValue) {
      defaultOptions.resetValue = parseInteger(svdData.device.resetValue[0]) ?? 0;
    }
    if (svdData.device.size) {
      defaultOptions.size = parseInteger(svdData.device.size[0]) ?? 0;
    }
    if (svdData.device.access) {
      defaultOptions.accessType = accessTypeFromString(svdData.device.access[0]);
    }

    if (!svdData.device.peripherals) {
      throw new Error('Unable to parse SVD file: no peripherals defined');
    }
    svdData.device.peripherals[0].peripheral.forEach(element => {
      const name = element.name[0];
      peripheralMap[name] = element;
    });

    for (const key in peripheralMap) {
      const element = peripheralMap[key];
      if (element.$ && element.$.derivedFrom) {
        const base = peripheralMap[element.$.derivedFrom];
        peripheralMap[key] = { ...base, ...element };
      }
    }

    const peripherials = [];
    for (const key in peripheralMap) {
      peripherials.push(this.parsePeripheral(peripheralMap[key], defaultOptions));
    }

    peripherials.sort(PeripheralNode.compare);

    for (const p of peripherials) {
      p.resolveDeferedEnums(this.enumTypeValuesMap); // This can throw an exception
      p.collectRanges();
    }

    return peripherials;
  }

  private cleanupDescription(input: string): string {
    return input.replace(/\r/g, '').replace(/\n\s*/g, ' ');
  }

  private parseFields(fieldInfo: any[], parent: PeripheralRegisterNode): PeripheralFieldNode[] {
    const fields: PeripheralFieldNode[] = [];

    if (fieldInfo === null || fieldInfo === undefined) {
      return fields;
    }

    fieldInfo.map(f => {
      let offset;
      let width;
      const description = this.cleanupDescription(f.description ? f.description[0] : '');

      if (f.bitOffset && f.bitWidth) {
        offset = parseInteger(f.bitOffset[0]) ?? 0;
        width = parseInteger(f.bitWidth[0]) ?? 0;
      } else if (f.bitRange) {
        let range = f.bitRange[0];
        range = range.substring(1, range.length - 1);
        range = range.split(':');
        const end = parseInteger(range[0]) ?? 0;
        const start = parseInteger(range[1]) ?? 0;
        width = end - start + 1;
        offset = start;
      } else if (f.msb && f.lsb) {
        const msb = parseInteger(f.msb[0]) ?? 0;
        const lsb = parseInteger(f.lsb[0]) ?? 0;
        width = msb - lsb + 1;
        offset = lsb;
      } else {
        // tslint:disable-next-line:max-line-length
        throw new Error(
          `Unable to parse SVD file: field ${f.name[0]} must have either bitOffset and bitWidth elements, bitRange Element, or msb and lsb elements.`
        );
      }

      let valueMap: EnumerationMap | undefined;
      let derivedFrom: string | undefined;
      if (f.enumeratedValues) {
        valueMap = {};
        const eValues = f.enumeratedValues[0];
        if (eValues.$ && eValues.$.derivedFrom) {
          const found = this.enumTypeValuesMap[eValues.$.derivedFrom];
          if (!found) {
            derivedFrom = eValues.$.derivedFrom as string;
            // valueMap = undefined;
          } else {
            valueMap = found;
          }
        } else if (eValues) {
          if (eValues.enumeratedValue) {
            eValues.enumeratedValue.map((ev: any) => {
              if (ev.value && ev.value.length > 0) {
                const evname = ev.name[0];
                const evdesc = this.cleanupDescription(ev.description ? ev.description[0] : '');
                const evvalue = parseInteger(ev.value[0]) ?? 0;

                valueMap = valueMap ?? {}; // lint thinks this can be undefined
                valueMap[evvalue] = new EnumeratedValue(evname, evdesc, evvalue);
              }
            });
          }

          // According to the SVD spec/schema, I am not sure any scope applies. Seems like everything is in a global name space
          // No make sense but how I am interpreting it for now. Easy to make it scope based but then why allow referencing
          // other peripherals. Global scope it is. Overrides duplicates from previous definitions!!!
          if (eValues.name && eValues.name[0]) {
            let evName = eValues.name[0];
            this.enumTypeValuesMap[evName] = valueMap;
            evName = f.name[0] + '.' + evName;
            this.enumTypeValuesMap[evName] = valueMap;
            let tmp: any = parent;
            while (tmp) {
              evName = tmp.name + '.' + evName;
              this.enumTypeValuesMap[evName] = valueMap;
              tmp = tmp.parent;
            }
            /*
                        for (const prefix of [null, f.name[0], parent.name, parent.parent.name]) {
                            evName = prefix ? prefix + '.' + evName : evName;
                            this.enumTypeValuesMap[evName] = valueMap;
                        }
                        */
          }
        }
      }

      const baseOptions: any = {
        name: f.name[0],
        description: description,
        offset: offset,
        width: width,
        enumeration: valueMap,
        derivedFrom: derivedFrom,
      };

      if (f.access) {
        baseOptions.accessType = accessTypeFromString(f.access[0]);
      }

      if (f.dim) {
        const count = parseInteger(f.dim[0]);
        if (!count || count < 1) {
          throw new Error(`Unable to parse SVD file: field ${f.name[0]} has dim element, with no/invalid dimensions.`);
        }
        const increment = f.dimIncrement[0] ? (parseInteger(f.dimIncrement[0]) ?? 0) : 0;
        if (!increment && count > 1) {
          throw new Error(
            `Unable to parse SVD file: field ${f.name[0]} has dim element, with no/invalid dimIncrement element.`
          );
        }

        //const count = parseInteger(f.dim[0]);
        if (count) {
          let index = [];
          if (f.dimIndex) {
            index = parseDimIndex(f.dimIndex[0], count);
          } else {
            for (let i = 0; i < count; i++) {
              index.push(`${i}`);
            }
          }

          const namebase: string = f.name[0];

          for (let i = 0; i < count; i++) {
            const name = namebase.replace('%s', index[i]);
            fields.push(
              new PeripheralFieldNode(parent, { ...baseOptions, name: name, offset: offset + increment * i })
            );
          }
        }
      } else {
        fields.push(new PeripheralFieldNode(parent, { ...baseOptions }));
      }
    });

    return fields;
  }

  private parseRegisters(regInfoOrig: any[], parent: PeripheralNode | PeripheralClusterNode): PeripheralRegisterNode[] {
    const regInfo = [...regInfoOrig]; // Make a shallow copy,. we will work on this
    const registers: PeripheralRegisterNode[] = [];

    const localRegisterMap: { [key: string]: any } = {};
    for (const r of regInfo) {
      const nm = r.name[0];
      localRegisterMap[nm] = r;
      this.peripheralRegisterMap[parent.name + '.' + nm] = r;
    }

    // It is weird to iterate this way but it can handle forward references, are they legal? not sure
    // Or we could have done this work in the loop above. Not the best way, but it is more resilient to
    // concatenate elements and re-parse. We are patching at XML level rather than object level
    let ix = 0;
    for (const r of regInfo) {
      const derivedFrom = r.$ ? r.$.derivedFrom : '';
      if (derivedFrom) {
        const nm = r.name[0];
        const from = localRegisterMap[derivedFrom] || this.peripheralRegisterMap[derivedFrom];
        if (!from) {
          throw new Error(`SVD error: Invalid 'derivedFrom' "${derivedFrom}" for register "${nm}"`);
        }
        // We are supposed to preserve all but the addressOffset, but the following should work
        const combined = { ...from, ...r };
        delete combined.$.derivedFrom; // No need to keep this anymore
        combined.$._derivedFrom = derivedFrom; // Save a backup for debugging
        localRegisterMap[nm] = combined;
        this.peripheralRegisterMap[parent.name + '.' + nm] = combined;
        regInfo[ix] = combined;
      }
      ix++;
    }

    for (const r of regInfo) {
      const baseOptions: any = {};
      if (r.access) {
        baseOptions.accessType = accessTypeFromString(r.access[0]);
      }
      if (r.size) {
        baseOptions.size = parseInteger(r.size[0]) ?? 0;
      }
      if (r.resetValue) {
        baseOptions.resetValue = parseInteger(r.resetValue[0]) ?? 0;
      }

      if (r.dim) {
        const count = parseInteger(r.dim[0]);
        if (!count || count < 1) {
          throw new Error(
            `Unable to parse SVD file: register ${r.name[0]} has dim element, with no/invalid dimensions.`
          );
        }
        const increment = r.dimIncrement[0] ? (parseInteger(r.dimIncrement[0]) ?? 0) : 0;
        if (!increment && count > 1) {
          throw new Error(
            `Unable to parse SVD file: register ${r.name[0]} has dim element, with no/invalid dimIncrement element.`
          );
        }
        const offsetbase = parseInteger(r.addressOffset[0]);
        if (offsetbase === undefined || offsetbase < 0) {
          throw new Error(
            `Unable to parse SVD file: register ${r.name[0]} has invalid addressOffset ${r.addressOffset[0] ?? 'undefined'}`
          );
        }

        let index = [];
        if (r.dimIndex) {
          index = parseDimIndex(r.dimIndex[0], count);
        } else {
          for (let i = 0; i < count; i++) {
            index.push(`${i}`);
          }
        }

        const namebase: string = r.name[0];
        const descbase: string = this.cleanupDescription(r.description ? r.description[0] : '');
        for (let i = 0; i < count; i++) {
          const name = namebase.replace('%s', index[i]);
          const description = descbase.replace('%s', index[i]);

          const register = new PeripheralRegisterNode(parent, {
            ...baseOptions,
            name: name,
            description: description,
            addressOffset: offsetbase + increment * i,
          });
          if (r.fields && r.fields.length === 1) {
            this.parseFields(r.fields[0].field, register);
          }
          registers.push(register);
        }
      } else {
        if (!r.addressOffset) {
          throw new Error(`Unable to parse SVD file: register ${r.name[0]} has no addressOffset`);
        }
        const description = this.cleanupDescription(r.description ? r.description[0] : '');
        const register = new PeripheralRegisterNode(parent, {
          ...baseOptions,
          name: r.name[0],
          description: description,
          addressOffset: parseInteger(r.addressOffset[0]),
        });
        if (r.fields && r.fields.length === 1) {
          this.parseFields(r.fields[0].field, register);
        }
        registers.push(register);
      }
    }

    registers.sort((a, b) => {
      if (a.offset < b.offset) {
        return -1;
      } else if (a.offset > b.offset) {
        return 1;
      } else {
        return 0;
      }
    });

    return registers;
  }

  private parseClusters(clusterInfo: any, parent: PeripheralOrClusterNode): PeripheralClusterNode[] {
    const clusters: PeripheralClusterNode[] = [];

    if (!clusterInfo) {
      return [];
    }

    clusterInfo.forEach((c: any) => {
      const baseOptions: any = {};
      if (c.access) {
        baseOptions.accessType = accessTypeFromString(c.access[0]);
      }
      if (c.size) {
        baseOptions.size = parseInteger(c.size[0]) ?? 0;
      }
      if (c.resetValue) {
        baseOptions.resetValue = parseInteger(c.resetValue[0]) ?? 0;
      }

      if (c.dim) {
        const count = parseInteger(c.dim[0]);
        if (!count || count < 1) {
          throw new Error(
            `Unable to parse SVD file: cluster ${c.name[0]} has dim element, with no/invalid dimensions.`
          );
        }
        const increment = c.dimIncrement[0] ? (parseInteger(c.dimIncrement[0]) ?? 0) : 0;
        if (!increment && count > 1) {
          throw new Error(
            `Unable to parse SVD file: cluster ${c.name[0]} has dim element, with no/invalid dimIncrement.`
          );
        }

        let index = [];
        if (c.dimIndex) {
          index = parseDimIndex(c.dimIndex[0], count);
        } else {
          for (let i = 0; i < count; i++) {
            index.push(`${i}`);
          }
        }

        const namebase: string = c.name[0];
        const descbase: string = this.cleanupDescription(c.description ? c.description[0] : '');
        const offsetbase = parseInteger(c.addressOffset[0]);
        if (offsetbase === undefined || offsetbase < 0) {
          throw new Error(`Unable to parse SVD file: cluster ${c.name[0]} has an no/invalid addressOffset`);
        }
        for (let i = 0; i < count; i++) {
          const name = namebase.replace('%s', index[i]);
          const description = descbase.replace('%s', index[i]);
          const cluster = new PeripheralClusterNode(parent, {
            ...baseOptions,
            name: name,
            description: description,
            addressOffset: offsetbase + increment * i,
          });
          if (c.register) {
            this.parseRegisters(c.register, cluster);
          }
          if (c.cluster) {
            this.parseClusters(c.cluster, cluster);
          }
          clusters.push(cluster);
        }
      } else {
        const description = this.cleanupDescription(c.description ? c.description[0] : '');
        const cluster = new PeripheralClusterNode(parent, {
          ...baseOptions,
          name: c.name[0],
          description: description,
          addressOffset: parseInteger(c.addressOffset[0]) ?? 0,
        });
        if (c.register) {
          this.parseRegisters(c.register, cluster);
          clusters.push(cluster);
        }
        if (c.cluster) {
          this.parseClusters(c.cluster, cluster);
          clusters.push(cluster);
        }
      }
    });

    return clusters;
  }

  private parsePeripheral(
    p: any,
    _defaults: { accessType: AccessType; size: number; resetValue: number }
  ): PeripheralNode {
    let totalLength = 0;
    if (p.addressBlock) {
      for (const ab of p.addressBlock) {
        const offset = parseInteger(ab.offset[0]);
        const size = parseInteger(ab.size[0]);
        if (offset !== undefined && size !== undefined) {
          totalLength = Math.max(totalLength, offset + size);
        }
      }
    }

    const options: any = {
      name: p.name[0],
      baseAddress: parseInteger(p.baseAddress ? p.baseAddress[0] : '0'),
      description: this.cleanupDescription(p.description ? p.description[0] : ''),
      totalLength: totalLength,
    };

    if (p.access) {
      options.accessType = accessTypeFromString(p.access[0]);
    }
    if (p.size) {
      options.size = parseInteger(p.size[0]);
    }
    if (p.resetValue) {
      options.resetValue = parseInteger(p.resetValue[0]);
    }
    if (p.groupName) {
      options.groupName = p.groupName[0];
    }

    const peripheral = new PeripheralNode(this.gapThreshold, options);

    if (p.registers) {
      if (p.registers[0].register) {
        this.parseRegisters(p.registers[0].register, peripheral);
      }
      if (p.registers[0].cluster) {
        this.parseClusters(p.registers[0].cluster, peripheral);
      }
    }

    return peripheral;
  }
}
