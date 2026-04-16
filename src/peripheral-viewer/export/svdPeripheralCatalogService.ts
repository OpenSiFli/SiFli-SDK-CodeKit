import { PeripheralTreeProvider } from '../views/peripheral-tree-provider';
import { PeripheralClusterNode } from '../views/nodes/peripheralclusternode';
import { PeripheralFieldNode } from '../views/nodes/peripheralfieldnode';
import { PeripheralNode } from '../views/nodes/peripheralnode';
import { PeripheralRegisterNode } from '../views/nodes/peripheralregisternode';
import { DebugSnapshotCandidateItem, DebugSnapshotPeripheralSnapshot } from '../../types/debugSnapshot';

interface ResolvedPeripheralInfo {
  peripheralName: string;
  address: number;
  size: number;
}

interface RegisterLeaf {
  path: string;
  node: PeripheralRegisterNode;
}

export class SvdPeripheralCatalogService {
  constructor(private readonly treeProvider: PeripheralTreeProvider) {}

  public resolvePeripheral(sessionId: string, peripheralName: string): ResolvedPeripheralInfo | undefined {
    const peripheral = this.treeProvider.findPeripheralByName(sessionId, peripheralName);
    if (!peripheral) {
      return undefined;
    }

    return {
      peripheralName,
      address: peripheral.baseAddress,
      size: this.calculatePeripheralSize(peripheral),
    };
  }

  public listExtraPeripheralItems(
    sessionId: string,
    excludedPeripherals: ReadonlySet<string>,
    reservedItemIds: ReadonlySet<string>
  ): DebugSnapshotCandidateItem[] {
    const sessionData = this.treeProvider.getSessionData(sessionId);
    if (!sessionData) {
      return [];
    }

    return sessionData.peripherals
      .filter(peripheral => !excludedPeripherals.has(peripheral.name))
      .map(peripheral => {
        const id = `svd:${peripheral.name}`;
        return {
          id: reservedItemIds.has(id) ? `svd-extra:${peripheral.name}` : id,
          kind: 'registerBlock',
          name: `${peripheral.name}_reg.bin`,
          address: peripheral.baseAddress,
          size: this.calculatePeripheralSize(peripheral),
          fileName: `${peripheral.name}_reg.bin`,
          selectedByDefault: false,
          source: 'svdExtra',
          blockName: peripheral.name,
          sourceType: 'svdPeripheral',
          peripheralName: peripheral.name,
        } satisfies DebugSnapshotCandidateItem;
      })
      .sort((left, right) => left.fileName.localeCompare(right.fileName));
  }

  public async capturePeripheralSnapshot(
    sessionId: string,
    peripheralName: string
  ): Promise<DebugSnapshotPeripheralSnapshot | undefined> {
    const peripheral =
      (await this.treeProvider.refreshPeripheralByName(sessionId, peripheralName)) ??
      this.treeProvider.findPeripheralByName(sessionId, peripheralName);
    if (!peripheral) {
      return undefined;
    }

    const registers = this.collectRegisterLeaves(peripheral);
    const snapshotRegisters: DebugSnapshotPeripheralSnapshot['registers'] = {};
    for (const register of registers) {
      const fields = register.node
        .getChildren()
        .reduce<Record<string, { value: number; enumeration?: string }>>((accumulator, field) => {
          const value = field.getValue();
          accumulator[field.name] = {
            value,
            enumeration: field.getEnumerationValue(value),
          };
          return accumulator;
        }, {});

      snapshotRegisters[register.path] = {
        address: register.node.getAddress(),
        value: register.node.getValue(),
        fields,
      };
    }

    return {
      peripheralName: peripheral.name,
      baseAddress: peripheral.baseAddress,
      registers: snapshotRegisters,
    };
  }

  private calculatePeripheralSize(peripheral: PeripheralNode): number {
    const registers = this.collectRegisterLeaves(peripheral);
    if (registers.length === 0) {
      return Math.max(4, peripheral.totalLength);
    }

    const start = Math.min(...registers.map(register => register.node.getAddress()));
    const end = Math.max(...registers.map(register => register.node.getAddress() + register.node.size / 8));
    return Math.max(4, end - start);
  }

  private collectRegisterLeaves(node: PeripheralNode | PeripheralClusterNode, prefix = ''): RegisterLeaf[] {
    const leaves: RegisterLeaf[] = [];
    const children = node.getChildren() as Array<PeripheralRegisterNode | PeripheralClusterNode>;
    for (const child of children) {
      if (child instanceof PeripheralRegisterNode) {
        leaves.push({
          path: prefix ? `${prefix}.${child.name}` : child.name,
          node: child,
        });
        continue;
      }

      if (child instanceof PeripheralClusterNode) {
        const nextPrefix = prefix ? `${prefix}.${child.name}` : child.name;
        leaves.push(...this.collectRegisterLeaves(child, nextPrefix));
      }
    }

    return leaves;
  }
}
