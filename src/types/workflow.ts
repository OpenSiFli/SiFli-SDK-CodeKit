export type WorkflowFailurePolicy = 'stop' | 'continue';

export type WorkflowStepType =
  | 'build.compile'
  | 'build.rebuild'
  | 'build.clean'
  | 'build.download'
  | 'build.menuconfig'
  | 'shell.command'
  | 'monitor.open'
  | 'monitor.close'
  | 'serial.selectPort';

export interface WorkflowRunIf {
  boardSelected?: boolean;
  serialPortSelected?: boolean;
  monitorActive?: boolean;
}

export interface WorkflowInputSpec {
  key: string;
  prompt: string;
  placeHolder?: string;
  defaultValue?: string;
  required?: boolean;
  password?: boolean;
}

export interface WorkflowStep {
  name?: string;
  type: WorkflowStepType;
  wait?: boolean;
  continueOnError?: boolean;
  runIf?: WorkflowRunIf;
  args?: Record<string, string | number | boolean>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  failurePolicy?: WorkflowFailurePolicy;
  inputs?: WorkflowInputSpec[];
  steps: WorkflowStep[];
}

export interface WorkflowStatusBarAction {
  kind: 'workflow' | 'command';
  workflowId?: string;
  commandId?: string;
}

export interface WorkflowStatusBarButton {
  id: string;
  text: string;
  tooltip?: string;
  priority?: number;
  alignment?: 'left' | 'right';
  action: WorkflowStatusBarAction;
}

export interface WorkflowValidationIssue {
  code: string;
  path: string;
  message: string;
}
