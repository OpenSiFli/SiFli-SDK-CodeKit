import * as vscode from 'vscode';
import { AddrRange } from '../../addrranges';
import { NodeSetting } from '../../common';
import { PeripheralBaseNode } from './basenode';

export class ActionNode extends PeripheralBaseNode {
  constructor(
    private readonly label: string,
    private readonly command: vscode.Command,
    private readonly iconPath?: vscode.ThemeIcon,
    private readonly tooltip?: string
  ) {
    super();
  }

  public getChildren(): PeripheralBaseNode[] {
    return [];
  }

  public getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.None);
    item.command = this.command;
    item.iconPath = this.iconPath;
    item.tooltip = this.tooltip;
    item.contextValue = 'peripheral-action';
    return item;
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
    // Intentionally empty.
  }

  public saveState(_path?: string): NodeSetting[] {
    return [];
  }

  public findByPath(_path: string[]): PeripheralBaseNode | undefined {
    return undefined;
  }
}
