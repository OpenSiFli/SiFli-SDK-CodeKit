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
import { AddrRange } from '../../addrranges';
import { NodeSetting } from '../../common';

export class MessageNode extends PeripheralBaseNode {
  constructor(
    public message: string,
    public tooltip?: string | vscode.MarkdownString
  ) {
    super();
  }

  public getChildren(): PeripheralBaseNode[] | Promise<PeripheralBaseNode[]> {
    return [];
  }

  public getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
    const ti = new vscode.TreeItem(this.message, vscode.TreeItemCollapsibleState.None);
    ti.contextValue = 'peripheral-message';
    if (this.tooltip) {
      // A null crashes VSCode Tree renderer
      ti.tooltip = this.tooltip;
    }
    return ti;
  }

  public getCopyValue(): string | undefined {
    return undefined;
  }

  public performUpdate(): Thenable<boolean> {
    return Promise.resolve(false);
  }

  public updateData(): Thenable<boolean> {
    return Promise.resolve(false);
  }

  public getPeripheral(): PeripheralBaseNode | undefined {
    return undefined;
  }

  public collectRanges(_ary: AddrRange[]): void {
    // Do nothing
  }

  public saveState(_path?: string): NodeSetting[] {
    return [];
  }

  public findByPath(_path: string[]): PeripheralBaseNode | undefined {
    return undefined;
  }
}
