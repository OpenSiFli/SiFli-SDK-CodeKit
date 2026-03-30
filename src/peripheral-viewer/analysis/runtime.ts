import * as vscode from 'vscode';
import { PeripheralTreeProvider } from '../views/peripheral-tree-provider';
import { PeripheralClusterNode } from '../views/nodes/peripheralclusternode';
import { PeripheralFieldNode } from '../views/nodes/peripheralfieldnode';
import { PeripheralNode } from '../views/nodes/peripheralnode';
import { PeripheralRegisterNode } from '../views/nodes/peripheralregisternode';
import {
  AnalysisFinding,
  AnalysisGroupResult,
  AnalysisInstanceResult,
  AnalysisSessionState,
  AnalysisSeverity,
  PeripheralAnalysisContext,
  PeripheralGroupAnalyzer,
  PeripheralSnapshot,
  RegisterSnapshot,
  SupportedChipModel,
} from './types';

type SessionGroupResults = Map<string, AnalysisGroupResult>;

export class PeripheralAnalysisRuntime {
  private readonly analyzers = new Map<SupportedChipModel, Map<string, PeripheralGroupAnalyzer>>();
  private readonly sessionResults = new Map<string, SessionGroupResults>();

  constructor(private readonly treeProvider: PeripheralTreeProvider) {}

  public register(analyzer: PeripheralGroupAnalyzer): void {
    const chipAnalyzers = this.analyzers.get(analyzer.chipModel) ?? new Map<string, PeripheralGroupAnalyzer>();
    chipAnalyzers.set(analyzer.groupName, analyzer);
    this.analyzers.set(analyzer.chipModel, chipAnalyzers);
  }

  public clearSession(sessionId: string): void {
    this.sessionResults.delete(sessionId);
  }

  public getActiveSessionState(): AnalysisSessionState | undefined {
    const sessionData = this.treeProvider.getActiveSessionData();
    if (!sessionData) {
      return undefined;
    }

    const chipModel = this.resolveChipModel(sessionData.deviceName);
    if (!chipModel) {
      return {
        sessionId: sessionData.session.id,
        deviceName: sessionData.deviceName,
        groups: [],
        message: vscode.l10n.t('The current SVD device is not supported by the peripheral analyzer.'),
      };
    }

    const visibleGroups = this.getVisibleGroups(chipModel, sessionData.peripherals);
    if (visibleGroups.length === 0) {
      return {
        sessionId: sessionData.session.id,
        chipModel,
        deviceName: sessionData.deviceName,
        groups: [],
        message: vscode.l10n.t('No supported peripheral analyzers are available for the current chip.'),
      };
    }

    const storedResults = this.sessionResults.get(sessionData.session.id);
    const groups = visibleGroups.map(groupName => {
      const stored = storedResults?.get(groupName);
      const instances = sessionData.peripherals
        .filter(peripheral => peripheral.groupName === groupName)
        .map(peripheral => {
          const storedInstance = stored?.instances.find(instance => instance.peripheralName === peripheral.name);
          return (
            storedInstance ?? {
              peripheralName: peripheral.name,
              groupName,
              status: 'not-analyzed' as const,
              findings: [],
            }
          );
        });

      return {
        groupName,
        instances,
      };
    });

    return {
      sessionId: sessionData.session.id,
      chipModel,
      deviceName: sessionData.deviceName,
      groups,
    };
  }

  public async runAll(): Promise<AnalysisSessionState | undefined> {
    const sessionData = this.treeProvider.getActiveSessionData();
    if (!sessionData) {
      return undefined;
    }

    const chipModel = this.resolveChipModel(sessionData.deviceName);
    if (!chipModel) {
      return this.getActiveSessionState();
    }

    const results = this.sessionResults.get(sessionData.session.id) ?? new Map<string, AnalysisGroupResult>();
    for (const groupName of this.getVisibleGroups(chipModel, sessionData.peripherals)) {
      results.set(groupName, await this.runGroupInternal(sessionData.session.id, chipModel, groupName));
    }
    this.sessionResults.set(sessionData.session.id, results);
    return this.getActiveSessionState();
  }

  public async runGroup(groupName: string): Promise<AnalysisSessionState | undefined> {
    const sessionData = this.treeProvider.getActiveSessionData();
    if (!sessionData) {
      return undefined;
    }

    const chipModel = this.resolveChipModel(sessionData.deviceName);
    if (!chipModel) {
      return this.getActiveSessionState();
    }

    const results = this.sessionResults.get(sessionData.session.id) ?? new Map<string, AnalysisGroupResult>();
    results.set(groupName, await this.runGroupInternal(sessionData.session.id, chipModel, groupName));
    this.sessionResults.set(sessionData.session.id, results);
    return this.getActiveSessionState();
  }

  public resolveChipModel(deviceName?: string): SupportedChipModel | undefined {
    const normalized = deviceName?.trim().toUpperCase();
    if (!normalized) {
      return undefined;
    }
    if (normalized.includes('SF32LB52X')) {
      return 'SF32LB52X';
    }
    if (normalized.includes('SF32LB56X')) {
      return 'SF32LB56X';
    }
    return undefined;
  }

  private getVisibleGroups(chipModel: SupportedChipModel, peripherals: readonly PeripheralNode[]): string[] {
    const supportedGroups = this.analyzers.get(chipModel);
    if (!supportedGroups) {
      return [];
    }

    return [
      ...new Set(
        peripherals.map(peripheral => peripheral.groupName).filter(groupName => supportedGroups.has(groupName))
      ),
    ].sort((left, right) => left.localeCompare(right));
  }

  private async runGroupInternal(
    sessionId: string,
    chipModel: SupportedChipModel,
    groupName: string
  ): Promise<AnalysisGroupResult> {
    const sessionData = this.treeProvider.getSessionData(sessionId);
    if (!sessionData) {
      return {
        groupName,
        instances: [],
      };
    }

    const analyzer = this.analyzers.get(chipModel)?.get(groupName);
    if (!analyzer) {
      return {
        groupName,
        instances: [],
      };
    }

    const snapshotCache = new Map<string, PeripheralSnapshot | undefined>();
    const context: PeripheralAnalysisContext = {
      chipModel,
      deviceName: sessionData.deviceName,
      readPeripheral: async name => {
        if (snapshotCache.has(name)) {
          return snapshotCache.get(name);
        }

        const refreshed = await this.treeProvider.refreshPeripheralByName(sessionId, name);
        const peripheral = refreshed ?? this.treeProvider.findPeripheralByName(sessionId, name);
        const snapshot = peripheral ? this.buildPeripheralSnapshot(peripheral) : undefined;
        snapshotCache.set(name, snapshot);
        return snapshot;
      },
      getInstanceNum: (peripheralName, explicitGroupName) => {
        const group = explicitGroupName ?? groupName;
        if (!peripheralName.startsWith(group)) {
          return -1;
        }
        const suffix = peripheralName.slice(group.length);
        return suffix ? Number.parseInt(suffix, 10) : -1;
      },
    };

    const instances: AnalysisInstanceResult[] = [];
    for (const peripheral of sessionData.peripherals.filter(candidate => candidate.groupName === groupName)) {
      try {
        const findings = await analyzer.analyze(peripheral.name, context);
        instances.push({
          peripheralName: peripheral.name,
          groupName,
          status: findings.length > 0 ? 'issues' : 'ok',
          findings,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        instances.push({
          peripheralName: peripheral.name,
          groupName,
          status: 'issues',
          findings: [
            {
              severity: AnalysisSeverity.Error,
              message: vscode.l10n.t('Analyzer failed: {0}', message),
            },
          ],
        });
      }
    }

    return {
      groupName,
      instances,
    };
  }

  private buildPeripheralSnapshot(peripheral: PeripheralNode): PeripheralSnapshot {
    const snapshot: PeripheralSnapshot = {
      name: peripheral.name,
      groupName: peripheral.groupName,
      baseAddress: peripheral.baseAddress,
      registers: {},
    };

    const visitNode = (node: PeripheralRegisterNode | PeripheralClusterNode): void => {
      if (node instanceof PeripheralRegisterNode) {
        const registerSnapshot: RegisterSnapshot = {
          value: node.getValue(),
        };
        for (const field of node.getChildren()) {
          registerSnapshot[field.name] = this.getFieldValue(field);
        }
        snapshot.registers[node.name] = registerSnapshot;
        snapshot[node.name] = registerSnapshot;
        return;
      }

      for (const child of node.getChildren()) {
        visitNode(child);
      }
    };

    for (const child of peripheral.getChildren() as Array<PeripheralRegisterNode | PeripheralClusterNode>) {
      visitNode(child);
    }

    return snapshot;
  }

  private getFieldValue(field: PeripheralFieldNode): number {
    return field.getValue();
  }
}
