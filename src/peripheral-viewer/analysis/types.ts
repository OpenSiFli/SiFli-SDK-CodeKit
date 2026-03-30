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
