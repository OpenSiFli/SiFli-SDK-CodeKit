export type KconfigNodeKind = 'menu' | 'comment' | 'choice' | 'symbol' | 'choice-item';

export interface KconfigNode {
  id: string;
  kind: KconfigNodeKind;
  prompt: string;
  symbol: string;
  type: string;
  value: string;
  assignable: string[];
  visible: boolean;
  editable: boolean;
  help: string;
  location: string;
  dependsOn?: string;
  choiceId?: string;
  children: KconfigNode[];
}

export interface KconfigSnapshot {
  projectRoot: string;
  projectPath: string;
  sdkPath: string;
  boardName: string;
  configFile: string;
  nodes: KconfigNode[];
  warnings: string[];
  dirty: boolean;
  generatedFiles?: string[];
}

export interface KconfigChange {
  symbol: string;
  value: string;
}
