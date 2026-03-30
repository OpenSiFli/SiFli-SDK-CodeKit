import { PeripheralBaseNode } from '../views/nodes/basenode';

export enum AnalysisSeverity {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
}

export interface AnalysisResult {
  severity: AnalysisSeverity;
  node: PeripheralBaseNode;
  message: string;
  detail?: string;
  suggestedValue?: string;
}

export interface AnalysisContext {
  peripherals: PeripheralBaseNode[];
  deviceName?: string;
}

export type SupportedChipModel = 'SF32LB52X' | 'SF32LB56X';

export type AnalysisInstanceStatus = 'not-analyzed' | 'ok' | 'issues';

export interface AnalysisFinding {
  severity: AnalysisSeverity;
  message: string;
  suggestion?: string;
  relatedPeripheral?: string;
  relatedRegister?: string;
}

export type RegisterSnapshot = Record<string, number> & { value: number };

export type PeripheralSnapshot = Record<string, any> & {
  name: string;
  groupName: string;
  baseAddress: number;
  registers: Record<string, RegisterSnapshot>;
};

export interface PeripheralAnalysisContext {
  chipModel: SupportedChipModel;
  deviceName?: string;
  readPeripheral(name: string): Promise<PeripheralSnapshot | undefined>;
  getInstanceNum(peripheralName: string, groupName?: string): number;
}

export interface PeripheralGroupAnalyzer {
  readonly chipModel: SupportedChipModel;
  readonly groupName: string;
  analyze(peripheralName: string, context: PeripheralAnalysisContext): Promise<AnalysisFinding[]>;
}

export interface AnalysisInstanceResult {
  peripheralName: string;
  groupName: string;
  status: AnalysisInstanceStatus;
  findings: AnalysisFinding[];
}

export interface AnalysisGroupResult {
  groupName: string;
  instances: AnalysisInstanceResult[];
}

export interface AnalysisSessionState {
  sessionId: string;
  chipModel?: SupportedChipModel;
  deviceName?: string;
  groups: AnalysisGroupResult[];
  message?: string;
}
