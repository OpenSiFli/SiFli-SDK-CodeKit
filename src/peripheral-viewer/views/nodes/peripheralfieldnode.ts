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
import { PeripheralRegisterNode } from './peripheralregisternode';
import { AccessType } from '../../svd-parser';
import { AddrRange } from '../../addrranges';
import { NumberFormat, NodeSetting } from '../../common';
import { parseInteger, binaryFormat, hexFormat } from '../../utils';

export interface EnumerationMap {
  [value: number]: EnumeratedValue;
}

export class EnumeratedValue {
  constructor(
    public name: string,
    public description: string,
    public value: number
  ) {}
}

export interface FieldOptions {
  name: string;
  description: string;
  offset: number;
  width: number;
  enumeration?: EnumerationMap;
  derivedFrom?: string; // Set this if unresolved
  accessType?: AccessType;
}

export class PeripheralFieldNode extends PeripheralBaseNode {
  public session: vscode.DebugSession | undefined;
  public readonly name: string;
  public readonly description: string;
  public readonly offset: number;
  public readonly width: number;
  public readonly accessType: AccessType;

  private enumeration: EnumerationMap | undefined;
  private enumerationValues: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private enumerationMap: any;
  private prevValue = '';

  constructor(
    public parent: PeripheralRegisterNode,
    private options: FieldOptions
  ) {
    super(parent);

    this.name = options.name;
    this.description = options.description;
    this.offset = options.offset;
    this.width = options.width;

    if (!options.accessType) {
      this.accessType = parent.accessType;
    } else {
      if (parent.accessType === AccessType.ReadOnly && options.accessType !== AccessType.ReadOnly) {
        this.accessType = AccessType.ReadOnly;
      } else if (parent.accessType === AccessType.WriteOnly && options.accessType !== AccessType.WriteOnly) {
        this.accessType = AccessType.WriteOnly;
      } else {
        this.accessType = options.accessType;
      }
    }

    if (options.enumeration) {
      this.setEnumeration(options.enumeration);
    }

    this.parent.addChild(this);
  }

  private setEnumeration(enumeration: EnumerationMap) {
    this.enumeration = enumeration;
    this.enumerationMap = {};
    this.enumerationValues = [];

    for (const key in enumeration) {
      const name = enumeration[key].name;

      this.enumerationValues.push(name);
      this.enumerationMap[name] = key;
    }
  }

  public getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
    const isReserved = this.name.toLowerCase() === 'reserved';

    let context = 'field';
    if (isReserved) {
      context = 'peripheral-field-reserved';
    } else if (this.accessType === AccessType.ReadOnly) {
      context = 'peripheral-field-ro';
    } else if (this.accessType === AccessType.WriteOnly) {
      context = 'peripheral-field-wo';
    } else {
      context = 'peripheral-field-rw';
    }

    const rangestart = this.offset;
    const rangeend = this.offset + this.width - 1;
    const label = `${this.name} [${rangeend}:${rangestart}]`;
    const displayValue = this.getFormattedValue(this.getFormat());
    const labelItem: vscode.TreeItemLabel = {
      label: label + ' ' + displayValue,
    };
    if (displayValue !== this.prevValue) {
      labelItem.highlights = [[label.length + 1, labelItem.label.length]];
      this.prevValue = displayValue;
    }
    const item = new vscode.TreeItem(labelItem, vscode.TreeItemCollapsibleState.None);

    item.contextValue = context;
    item.tooltip = this.generateTooltipMarkdown(isReserved) || undefined;

    return item;
  }

  private generateTooltipMarkdown(isReserved: boolean): vscode.MarkdownString | null {
    const mds = new vscode.MarkdownString('', true);
    mds.isTrusted = true;

    const address = `${hexFormat(this.parent.getAddress())}${this.getFormattedRange()}`;

    if (isReserved) {
      mds.appendMarkdown(`| ${this.name}@${address} | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | *Reserved* |\n`);
      mds.appendMarkdown('|:---|:---:|---:|');
      return mds;
    }

    const formattedValue = this.getFormattedValue(this.getFormat(), true);

    const roLabel = this.accessType === AccessType.ReadOnly ? '(Read Only)' : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';

    mds.appendMarkdown(`| ${this.name}@${address} | ${roLabel} | *${formattedValue}* |\n`);
    mds.appendMarkdown('|:---|:---:|---:|\n\n');

    if (this.accessType !== AccessType.WriteOnly) {
      mds.appendMarkdown(`**Reset Value:** ${this.formatValue(this.getResetValue(), this.getFormat())}\n`);
    }

    mds.appendMarkdown('\n____\n\n');
    mds.appendMarkdown(this.description);

    mds.appendMarkdown('\n_____\n\n');

    // Don't try to display current value table for write only fields
    if (this.accessType === AccessType.WriteOnly) {
      return mds;
    }

    const value = this.parent.extractBits(this.offset, this.width);
    const hex = hexFormat(value, Math.ceil(this.width / 4), true);
    const decimal = value.toString();
    const binary = binaryFormat(value, this.width);

    if (this.enumeration) {
      mds.appendMarkdown(
        '| Enumeration Value &nbsp;&nbsp; | Hex &nbsp;&nbsp; | Decimal &nbsp;&nbsp; | Binary &nbsp;&nbsp; |\n'
      );
      mds.appendMarkdown('|:---|:---|:---|:---|\n');
      let ev = 'Unknown';
      if (this.enumeration[value]) {
        ev = this.enumeration[value].name;
      }

      mds.appendMarkdown(
        `| ${ev} &nbsp;&nbsp; | ${hex} &nbsp;&nbsp; | ${decimal} &nbsp;&nbsp; | ${binary} &nbsp;&nbsp; |\n\n`
      );
      if (this.enumeration[value] && this.enumeration[value].description) {
        mds.appendMarkdown(this.enumeration[value].description);
      }
    } else {
      mds.appendMarkdown('| Hex &nbsp;&nbsp; | Decimal &nbsp;&nbsp; | Binary &nbsp;&nbsp; |\n');
      mds.appendMarkdown('|:---|:---|:---|\n');
      mds.appendMarkdown(`| ${hex} &nbsp;&nbsp; | ${decimal} &nbsp;&nbsp; | ${binary} &nbsp;&nbsp; |\n`);
    }

    return mds;
  }

  public getFormattedRange(): string {
    const rangestart = this.offset;
    const rangeend = this.offset + this.width - 1;
    return `[${rangeend}:${rangestart}]`;
  }

  private getCurrentValue(): number {
    return this.parent.extractBits(this.offset, this.width);
  }

  public getValue(): number {
    return this.getCurrentValue();
  }

  private getResetValue(): number {
    return this.parent.extractBitsFromReset(this.offset, this.width);
  }

  public getFormattedValue(format: NumberFormat, includeEnumeration = true): string {
    return this.formatValue(this.getCurrentValue(), format, includeEnumeration);
  }

  private formatValue(value: number, format: NumberFormat, includeEnumeration = true): string {
    if (this.accessType === AccessType.WriteOnly) {
      return '(Write Only)';
    }

    let formatted = '';

    switch (format) {
      case NumberFormat.Decimal:
        formatted = value.toString();
        break;
      case NumberFormat.Binary:
        formatted = binaryFormat(value, this.width);
        break;
      case NumberFormat.Hexadecimal:
        formatted = hexFormat(value, Math.ceil(this.width / 4), true);
        break;
      default:
        formatted =
          this.width >= 4 ? hexFormat(value, Math.ceil(this.width / 4), true) : binaryFormat(value, this.width);
        break;
    }

    if (includeEnumeration && this.enumeration) {
      if (this.enumeration[value]) {
        formatted = `${this.enumeration[value].name} (${formatted})`;
      } else {
        formatted = `Unknown Enumeration (${formatted})`;
      }
    }

    return formatted;
  }

  public getEnumerationValue(value: number): string | undefined {
    if (!this.enumeration) {
      return undefined;
    }

    if (this.enumeration[value]) {
      return this.enumeration[value].name;
    }
  }

  public getChildren(): PeripheralBaseNode[] | Promise<PeripheralBaseNode[]> {
    return [];
  }

  public performUpdate(): Thenable<boolean> {
    return new Promise((resolve, reject) => {
      if (this.enumeration) {
        const items: vscode.QuickPickItem[] = [];
        for (const eStr of this.enumerationValues) {
          const numval = this.enumerationMap[eStr];
          const e = this.enumeration[numval];
          const item: vscode.QuickPickItem = {
            label: eStr,
            detail: e.description,
          };
          items.push(item);
        }
        vscode.window.showQuickPick(items).then(val => {
          if (val === undefined) {
            resolve(false);
            return;
          }

          const numval = this.enumerationMap[val.label];
          this.parent.updateBits(this.offset, this.width, numval).then(resolve, reject);
        });
      } else {
        vscode.window
          .showInputBox({
            prompt: vscode.l10n.t(
              'Enter a new field value. Prefix hexadecimal values with 0x and binary values with 0b.'
            ),
            value: this.getCopyValue(),
          })
          .then(val => {
            if (typeof val !== 'string') {
              resolve(false);
              return;
            }

            const numval = parseInteger(val);
            if (numval === undefined) {
              reject(new Error(vscode.l10n.t('Value entered is not a valid format.')));
              return;
            }
            this.parent.updateBits(this.offset, this.width, numval).then(resolve, reject);
          });
      }
    });
  }

  public getCopyValue(): string {
    const value = this.parent.extractBits(this.offset, this.width);
    switch (this.getFormat()) {
      case NumberFormat.Decimal:
        return value.toString();
      case NumberFormat.Binary:
        return binaryFormat(value, this.width);
      case NumberFormat.Hexadecimal:
        return hexFormat(value, Math.ceil(this.width / 4), true);
      default:
        return this.width >= 4 ? hexFormat(value, Math.ceil(this.width / 4), true) : binaryFormat(value, this.width);
    }
  }

  public updateData(): Thenable<boolean> {
    return Promise.resolve(true);
  }

  public getFormat(): NumberFormat {
    if (this.format !== NumberFormat.Auto) {
      return this.format;
    } else {
      return this.parent.getFormat();
    }
  }

  public saveState(path: string): NodeSetting[] {
    if (this.format !== NumberFormat.Auto) {
      return [{ node: `${path}.${this.name}`, format: this.format }];
    } else {
      return [];
    }
  }

  public findByPath(path: string[]): PeripheralBaseNode | undefined {
    if (path.length === 0) {
      return this;
    } else {
      return undefined;
    }
  }

  public getPeripheral(): PeripheralBaseNode {
    return this.parent.getPeripheral();
  }

  public collectRanges(_a: AddrRange[]): void {
    throw new Error('Method not implemented.');
  }

  public resolveDeferedEnums(enumTypeValuesMap: { [key: string]: EnumerationMap }) {
    if (this.options.derivedFrom) {
      const map = enumTypeValuesMap[this.options.derivedFrom];
      if (map) {
        this.setEnumeration(map);
        this.options.derivedFrom = undefined;
      } else {
        throw new Error(`Invalid derivedFrom=${this.options.derivedFrom} for enumeratedValues of field ${this.name}`);
      }
    }
  }
}
