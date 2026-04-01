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
import { PeripheralBaseNode, ClusterOrRegisterBaseNode } from './basenode';
import { PeripheralRegisterNode, PeripheralRegisterOptions } from './peripheralregisternode';
import { PeripheralNode } from './peripheralnode';
import { AccessType } from '../../svd-parser';
import { NodeSetting, NumberFormat } from '../../common';
import { AddrRange } from '../../addrranges';
import { hexFormat } from '../../utils';
import { EnumerationMap } from './peripheralfieldnode';

export interface ClusterOptions {
  name: string;
  description?: string;
  addressOffset: number;
  accessType?: AccessType;
  size?: number;
  resetValue?: number;
  registers?: PeripheralRegisterOptions[];
  clusters?: ClusterOptions[];
}

export type PeripheralOrClusterNode = PeripheralNode | PeripheralClusterNode;
export type PeripheralRegisterOrClusterNode = PeripheralRegisterNode | PeripheralClusterNode;

export class PeripheralClusterNode extends ClusterOrRegisterBaseNode {
  private children: PeripheralRegisterOrClusterNode[];
  public readonly name: string;
  public readonly description?: string;
  public readonly offset: number;
  public readonly size: number;
  public readonly resetValue: number;
  public readonly accessType: AccessType;

  constructor(
    public parent: PeripheralOrClusterNode,
    options: ClusterOptions
  ) {
    super(parent);
    this.name = options.name;
    this.description = options.description;
    this.offset = options.addressOffset;
    this.accessType = options.accessType || AccessType.ReadWrite;
    this.size = options.size || parent.size;
    this.resetValue = options.resetValue || parent.resetValue;
    this.children = [];
    this.parent.addChild(this);

    for (const cluster of options.clusters || []) {
      this.addChild(new PeripheralClusterNode(this, cluster));
    }

    for (const register of options.registers || []) {
      this.addChild(new PeripheralRegisterNode(this, register));
    }
  }

  public getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
    const label = `${this.name} [${hexFormat(this.offset, 0)}]`;

    const item = new vscode.TreeItem(
      label,
      this.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
    );
    item.contextValue = 'peripheral-cluster';
    item.tooltip = this.description || undefined;

    return item;
  }

  public getChildren(): PeripheralRegisterOrClusterNode[] {
    return this.children;
  }

  public setChildren(children: PeripheralRegisterOrClusterNode[]): void {
    this.children = children.slice(0, children.length);
    this.children.sort((c1, c2) => (c1.offset > c2.offset ? 1 : -1));
  }

  public addChild(child: PeripheralRegisterOrClusterNode): void {
    this.children.push(child);
    this.children.sort((c1, c2) => (c1.offset > c2.offset ? 1 : -1));
  }

  public getBytes(offset: number, size: number): Uint8Array {
    return this.parent.getBytes(this.offset + offset, size);
  }

  public getAddress(offset: number): number {
    return this.parent.getAddress(this.offset + offset);
  }

  public getOffset(offset: number): number {
    return this.parent.getOffset(this.offset + offset);
  }

  public getFormat(): NumberFormat {
    if (this.format !== NumberFormat.Auto) {
      return this.format;
    } else {
      return this.parent.getFormat();
    }
  }

  public updateData(): Thenable<boolean> {
    return new Promise((resolve, reject) => {
      const promises = this.children.map(r => r.updateData());
      Promise.all(promises)
        .then(() => {
          resolve(true);
        })
        .catch(() => {
          reject('Failed');
        });
    });
  }

  public saveState(path: string): NodeSetting[] {
    const results: NodeSetting[] = [];

    if (this.format !== NumberFormat.Auto || this.expanded) {
      results.push({ node: `${path}.${this.name}`, expanded: this.expanded, format: this.format });
    }

    this.children.forEach(c => {
      results.push(...c.saveState(`${path}.${this.name}`));
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

  public collectRanges(ary: AddrRange[]): void {
    this.children.map(r => {
      r.collectRanges(ary);
    });
  }

  public getPeripheral(): PeripheralBaseNode {
    return this.parent.getPeripheral();
  }

  public getCopyValue(): string {
    throw new Error('Method not implemented.');
  }

  public performUpdate(): Thenable<boolean> {
    throw new Error('Method not implemented.');
  }

  public resolveDeferedEnums(enumTypeValuesMap: { [key: string]: EnumerationMap }) {
    for (const child of this.children) {
      child.resolveDeferedEnums(enumTypeValuesMap);
    }
  }
}
