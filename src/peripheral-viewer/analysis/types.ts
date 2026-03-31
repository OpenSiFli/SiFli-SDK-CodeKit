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

export type AnalysisViewMode = 'peripheral' | 'severity';
export type AnalysisSeverityFilter = 'all' | AnalysisSeverity.Error | AnalysisSeverity.Warning;
export type AnalysisStatusFilter = 'all' | 'issues' | 'clean';
export type AnalysisBucketId = 'error' | 'warning' | 'clean' | 'not-analyzed';

export interface AnalysisFilterState {
  severity: AnalysisSeverityFilter;
  status: AnalysisStatusFilter;
  groups: string[];
}

export interface AnalysisSummary {
  totalGroups: number;
  visibleGroups: number;
  totalInstances: number;
  visibleInstances: number;
  errorCount: number;
  warningCount: number;
  issueCount: number;
  cleanCount: number;
  notAnalyzedCount: number;
}

export interface AnalysisFindingPresentation extends AnalysisFinding {
  id: string;
  groupName: string;
  peripheralName: string;
}

export interface AnalysisInstancePresentation {
  id: string;
  peripheralName: string;
  groupName: string;
  status: AnalysisInstanceStatus;
  findings: AnalysisFindingPresentation[];
  errorCount: number;
  warningCount: number;
  issueCount: number;
  cleanCount: number;
  notAnalyzedCount: number;
}

export interface AnalysisGroupPresentation {
  id: string;
  groupName: string;
  instances: AnalysisInstancePresentation[];
  errorCount: number;
  warningCount: number;
  issueCount: number;
  cleanCount: number;
  notAnalyzedCount: number;
}

export interface AnalysisBucketPresentation {
  id: AnalysisBucketId;
  label: string;
  groups: AnalysisGroupPresentation[];
  errorCount: number;
  warningCount: number;
  issueCount: number;
  cleanCount: number;
  notAnalyzedCount: number;
}

export interface AnalysisPresentationSnapshot {
  hasActiveSession: boolean;
  sessionId?: string;
  chipModel?: SupportedChipModel;
  deviceName?: string;
  message?: string;
  viewMode: AnalysisViewMode;
  filters: AnalysisFilterState;
  availableGroups: string[];
  summary: AnalysisSummary;
  groups: AnalysisGroupPresentation[];
  buckets: AnalysisBucketPresentation[];
}
