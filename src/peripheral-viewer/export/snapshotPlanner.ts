import { DebugSnapshotCandidateItem, DebugSnapshotPlan } from '../../types/debugSnapshot';
import { DebugSnapshotChipDefinition } from './chipCatalogService';
import { resolvePsramRegions } from './memoryWindowResolver';
import { SnapshotTemplateRegistry } from './snapshotTemplateRegistry';
import { SvdPeripheralCatalogService } from './svdPeripheralCatalogService';
import { PeripheralViewerSessionData } from '../session-data';

export class SnapshotPlanner {
  constructor(
    private readonly templateRegistry: SnapshotTemplateRegistry,
    private readonly svdPeripheralCatalogService: SvdPeripheralCatalogService
  ) {}

  public buildPlan(sessionData: PeripheralViewerSessionData, chip: DebugSnapshotChipDefinition): DebugSnapshotPlan {
    const template = this.templateRegistry.getTemplate(chip.partNumber);
    if (!template) {
      throw new Error(`No debug snapshot template is registered for ${chip.partNumber}.`);
    }

    const warnings: string[] = [];
    const items: DebugSnapshotCandidateItem[] = [];
    const excludedPeripherals = new Set<string>();
    const usedItemIds = new Set<string>();

    for (const templateItem of template.items) {
      if (templateItem.kind === 'memoryRegion') {
        const candidate: DebugSnapshotCandidateItem = {
          id: `template:${templateItem.fileName}`,
          kind: 'memoryRegion',
          name: templateItem.fileName,
          address: templateItem.address,
          size: templateItem.size,
          fileName: templateItem.fileName,
          selectedByDefault: templateItem.selectedByDefault,
          source: templateItem.source,
          memoryKind: templateItem.memoryKind,
        };
        items.push(candidate);
        usedItemIds.add(candidate.id);
        continue;
      }

      if (templateItem.sourceType === 'fixedAddress') {
        const candidate: DebugSnapshotCandidateItem = {
          id: `template:${templateItem.fileName}`,
          kind: 'registerBlock',
          name: templateItem.fileName,
          address: templateItem.address ?? 0,
          size: templateItem.size ?? 0,
          fileName: templateItem.fileName,
          selectedByDefault: templateItem.selectedByDefault,
          source: templateItem.source,
          blockName: templateItem.blockName,
          sourceType: templateItem.sourceType,
          peripheralName: templateItem.peripheralName,
        };
        items.push(candidate);
        usedItemIds.add(candidate.id);
        if (candidate.peripheralName) {
          excludedPeripherals.add(candidate.peripheralName);
        }
        continue;
      }

      const peripheralName = templateItem.peripheralName;
      if (!peripheralName) {
        warnings.push(`Template item ${templateItem.fileName} is missing an SVD peripheral name.`);
        continue;
      }

      const resolved = this.svdPeripheralCatalogService.resolvePeripheral(sessionData.session.id, peripheralName);
      if (!resolved) {
        warnings.push(`Skipped ${templateItem.fileName} because ${peripheralName} was not found in the active SVD.`);
        continue;
      }

      const candidate: DebugSnapshotCandidateItem = {
        id: `template:${templateItem.fileName}`,
        kind: 'registerBlock',
        name: templateItem.fileName,
        address: resolved.address,
        size: resolved.size,
        fileName: templateItem.fileName,
        selectedByDefault: templateItem.selectedByDefault,
        source: templateItem.source,
        blockName: templateItem.blockName,
        sourceType: templateItem.sourceType,
        peripheralName: resolved.peripheralName,
      };
      items.push(candidate);
      usedItemIds.add(candidate.id);
      excludedPeripherals.add(resolved.peripheralName);
    }

    for (const psram of resolvePsramRegions(chip)) {
      const candidate: DebugSnapshotCandidateItem = {
        id: `dynamic:${psram.fileName}`,
        kind: 'memoryRegion',
        name: psram.fileName,
        address: psram.address,
        size: psram.size,
        fileName: psram.fileName,
        selectedByDefault: true,
        source: 'dynamicPsram',
        memoryKind: 'psram',
        backingMpi: psram.backingMpi,
      };
      items.push(candidate);
      usedItemIds.add(candidate.id);
    }

    items.push(
      ...this.svdPeripheralCatalogService.listExtraPeripheralItems(
        sessionData.session.id,
        excludedPeripherals,
        usedItemIds
      )
    );

    return {
      session: {
        sessionId: sessionData.session.id,
        sessionName: sessionData.session.name,
        executionState: sessionData.executionState,
        svdPath: sessionData.svdPath,
        canExport: sessionData.executionState === 'stopped',
      },
      chip: {
        modelId: chip.modelId,
        partNumber: chip.partNumber,
      },
      items: items.sort((left, right) => {
        if (left.selectedByDefault !== right.selectedByDefault) {
          return left.selectedByDefault ? -1 : 1;
        }
        return left.fileName.localeCompare(right.fileName);
      }),
      warnings,
    };
  }
}
