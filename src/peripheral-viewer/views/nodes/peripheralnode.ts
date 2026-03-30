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

import * as vscode from 'vscode';
import { PeripheralBaseNode } from './basenode';
import { PeripheralRegisterNode, PeripheralRegisterOptions } from './peripheralregisternode';
import { ClusterOptions, PeripheralClusterNode, PeripheralRegisterOrClusterNode } from './peripheralclusternode';
import { AddrRange, AddressRangesUtils } from '../../addrranges';
import { NumberFormat, NodeSetting } from '../../common';
import { MemUtils } from '../../memreadutils';
import { AccessType } from '../../svd-parser';
import { hexFormat } from '../../utils';
import { EnumerationMap } from './peripheralfieldnode';

export interface PeripheralOptions {
  name: string;
  baseAddress: number;
  totalLength: number;
  description: string;
  groupName?: string;
  accessType?: AccessType;
  size?: number;
  resetValue?: number;

  registers?: PeripheralRegisterOptions[];
  clusters?: ClusterOptions[];
}

export class PeripheralNode extends PeripheralBaseNode {
  private children: Array<PeripheralRegisterNode | PeripheralClusterNode>;

  public readonly name: string;
  public readonly baseAddress: number;
  public readonly description: string;
  public readonly groupName: string;
  public readonly totalLength: number;
  public readonly accessType = AccessType.ReadOnly;
  public readonly size: number;
  public readonly resetValue: number;
  protected addrRanges: AddrRange[];

  private currentValue: number[] = [];

  constructor(
    public gapThreshold: number,
    options: PeripheralOptions
  ) {
    super();

    this.name = options.name;
    this.baseAddress = options.baseAddress;
    this.totalLength = options.totalLength;
    this.description = options.description;
    this.groupName = options.groupName || '';
    this.resetValue = options.resetValue || 0;
    this.size = options.size || 32;
    this.children = [];
    this.addrRanges = [];

    for (const cluster of options.clusters || []) {
      this.addChild(new PeripheralClusterNode(this, cluster));
    }

    for (const register of options.registers || []) {
      this.addChild(new PeripheralRegisterNode(this, register));
    }
  }

  public getPeripheral(): PeripheralBaseNode {
    return this;
  }

  public getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
    const label = `${this.name} @ ${hexFormat(this.baseAddress)}`;
    const item = new vscode.TreeItem(
      label,
      this.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
    );
    item.contextValue = this.pinned ? 'peripheral-pinned' : 'peripheral';
    item.tooltip = this.description || undefined;
    if (this.pinned) {
      item.iconPath = new vscode.ThemeIcon('pinned');
    }
    return item;
  }

  public getCopyValue(): string {
    throw new Error('Method not implemented.');
  }

  public getChildren(): PeripheralBaseNode[] | Promise<PeripheralBaseNode[]> {
    return this.children;
  }

  public setChildren(children: Array<PeripheralRegisterNode | PeripheralClusterNode>): void {
    this.children = children;
    this.children.sort((c1, c2) => (c1.offset > c2.offset ? 1 : -1));
  }

  public addChild(child: PeripheralRegisterOrClusterNode): void {
    this.children.push(child);
    this.children.sort((c1, c2) => (c1.offset > c2.offset ? 1 : -1));
  }

  public getBytes(offset: number, size: number): Uint8Array {
    try {
      return new Uint8Array(this.currentValue.slice(offset, offset + size));
    } catch (e) {
      return new Uint8Array(0);
    }
  }

  public getAddress(offset: number): number {
    return this.baseAddress + offset;
  }

  public getOffset(offset: number): number {
    return offset;
  }

  public getFormat(): NumberFormat {
    return this.format;
  }

  public async updateData(): Promise<boolean> {
    if (!this.expanded) {
      return false;
    }

    try {
      const errors = await this.readMemory();
      for (const error of errors) {
        const str = `Failed to update peripheral ${this.name}: ${error}`;
        if (vscode.debug.activeDebugConsole) {
          vscode.debug.activeDebugConsole.appendLine(str);
        }
      }
    } catch (e) {
      /* This should never happen */
      const msg = (e as Error).message || 'unknown error';
      const str = `Failed to update peripheral ${this.name}: ${msg}`;
      if (vscode.debug.activeDebugConsole) {
        vscode.debug.activeDebugConsole.appendLine(str);
      }
    }

    try {
      const promises = this.children.map(r => r.updateData());
      await Promise.all(promises);
      return true;
    } catch (e) {
      /* This should never happen */
      const str = `Internal error: Failed to update peripheral ${this.name} after memory reads`;
      if (vscode.debug.activeDebugConsole) {
        vscode.debug.activeDebugConsole.appendLine(str);
      }
      // Could return false, but some things could have been updated. Returning true triggers a GUI refresh
      return true;
    }
  }

  protected readMemory(): Promise<Error[]> | [] {
    if (!this.currentValue) {
      this.currentValue = new Array<number>(this.totalLength);
    }

    if (this.session) {
      return MemUtils.readMemoryChunks(this.session, this.baseAddress, this.addrRanges, this.currentValue);
    } else {
      return [];
    }
  }

  public collectRanges(): void {
    const addresses: AddrRange[] = [];
    this.children.map(child => child.collectRanges(addresses));
    addresses.sort((a, b) => (a.base < b.base ? -1 : a.base > b.base ? 1 : 0));
    addresses.map(r => (r.base += this.baseAddress));

    const maxGap = this.gapThreshold;
    let ranges: AddrRange[] = [];
    if (maxGap >= 0) {
      let last: AddrRange | undefined;
      for (const r of addresses) {
        if (last && last.nxtAddr() + maxGap >= r.base) {
          const max = Math.max(last.nxtAddr(), r.nxtAddr());
          last.length = max - last.base;
        } else {
          ranges.push(r);
          last = r;
        }
      }
    } else {
      ranges = addresses;
    }

    // OpenOCD has an issue where the max number of bytes readable are 8191 (instead of 8192)
    // which causes unaligned reads (via gdb) and silent failures. There is patch for this in OpenOCD
    // but in general, it is good to split the reads up. see http://openocd.zylin.com/#/c/5109/
    // Another benefit, we can minimize gdb timeouts
    const maxBytes = 4 * 1024; // Should be a multiple of 4 to be safe for MMIO reads
    this.addrRanges = AddressRangesUtils.splitIntoChunks(ranges, maxBytes, this.name, this.totalLength);
  }

  public getPeripheralNode(): PeripheralNode {
    return this;
  }

  public selected(): Thenable<boolean> {
    return this.performUpdate();
  }

  public saveState(_path?: string): NodeSetting[] {
    const results: NodeSetting[] = [];

    if (this.format !== NumberFormat.Auto || this.expanded || this.pinned) {
      results.push({
        node: `${this.name}`,
        expanded: this.expanded,
        format: this.format,
        pinned: this.pinned,
      });
    }

    this.children.forEach(c => {
      results.push(...c.saveState(`${this.name}`));
    });

    return results;
  }

  public findByPath(path: string[]): PeripheralBaseNode | undefined {
    if (path.length === 0) {
      return this;
    } else {
      const child = this.children.find(c => c.name === path[0]);
      if (child) {
        return child.findByPath(path.slice(1));
      } else {
        return undefined;
      }
    }
  }

  public performUpdate(): Thenable<boolean> {
    throw new Error('Method not implemented.');
  }

  public static compare(p1: PeripheralNode, p2: PeripheralNode): number {
    if ((p1.pinned && p2.pinned) || (!p1.pinned && !p2.pinned)) {
      // none or both peripherals are pinned, sort by name prioritizing groupname
      if (p1.groupName !== p2.groupName) {
        return p1.groupName > p2.groupName ? 1 : -1;
      } else if (p1.name !== p2.name) {
        return p1.name > p2.name ? 1 : -1;
      } else {
        return 0;
      }
    } else {
      return p1.pinned ? -1 : 1;
    }
  }

  public resolveDeferedEnums(enumTypeValuesMap: { [key: string]: EnumerationMap }) {
    for (const child of this.children) {
      child.resolveDeferedEnums(enumTypeValuesMap);
    }
  }
}
