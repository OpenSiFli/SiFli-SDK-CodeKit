import * as vscode from 'vscode';
import { PeripheralNode } from './views/nodes/peripheralnode';

export type PeripheralSessionExecutionState = 'unknown' | 'running' | 'stopped';

export interface PeripheralViewerSessionData {
  session: vscode.DebugSession;
  deviceName?: string;
  svdPath?: string;
  executionState: PeripheralSessionExecutionState;
  peripherals: readonly PeripheralNode[];
}
