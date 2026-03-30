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

import { Command, TreeItem, DebugSession } from 'vscode';
import { NumberFormat, NodeSetting } from '../../common';
import { AddrRange } from '../../addrranges';
import { EnumerationMap } from './peripheralfieldnode';

export abstract class BaseNode {
  public expanded: boolean;

  constructor(protected readonly parent?: BaseNode) {
    this.expanded = false;
  }

  public getParent(): BaseNode | undefined {
    return this.parent;
  }

  public abstract getChildren(): BaseNode[] | Promise<BaseNode[]>;
  public abstract getTreeItem(): TreeItem | Promise<TreeItem>;

  public getCommand(): Command | undefined {
    return undefined;
  }

  public abstract getCopyValue(): string | undefined;
}

export abstract class PeripheralBaseNode extends BaseNode {
  public format: NumberFormat;
  public pinned: boolean;
  public readonly name: string | undefined;
  public session: DebugSession | undefined;

  constructor(public readonly parent?: PeripheralBaseNode) {
    super(parent);
    this.format = NumberFormat.Auto;
    this.pinned = false;
  }

  public selected(): Thenable<boolean> {
    return Promise.resolve(false);
  }

  public abstract performUpdate(): Thenable<boolean>;
  public abstract updateData(): Thenable<boolean>;

  public abstract getChildren(): PeripheralBaseNode[] | Promise<PeripheralBaseNode[]>;
  public abstract getPeripheral(): PeripheralBaseNode | undefined;

  public abstract collectRanges(ary: AddrRange[]): void; // Append addr range(s) to array

  public abstract saveState(path?: string): NodeSetting[];
  public abstract findByPath(path: string[]): PeripheralBaseNode | undefined;

  public async setSession(session: DebugSession): Promise<void> {
    this.session = session;
    const children = await this.getChildren();
    for (const child of children) {
      child.setSession(session);
    }
  }
}

export abstract class ClusterOrRegisterBaseNode extends PeripheralBaseNode {
  public readonly offset: number | undefined;
  public abstract resolveDeferedEnums(enumTypeValuesMap: { [key: string]: EnumerationMap }): void;
}
