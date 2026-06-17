import { CMD_PREFIX } from '../constants';
import { applyEdits, findNodeAtLocation, getNodeValue, modify, parseTree, type ParseError } from 'jsonc-parser';

export interface WorkflowKeybindingRule {
  key: string;
  command: string;
  args?: unknown;
  when?: string;
}

export const WORKFLOW_KEYBINDING_COMMAND = `${CMD_PREFIX}workflows.run`;
export const DEFAULT_WORKFLOW_KEYBINDING_WHEN = 'sifli.isProject';

// 统一用户输入，兼容用户从旧提示里复制的分号写法。
export function normalizeWorkflowKeybinding(input: string): string {
  return input
    .trim()
    .replace(/\s*;\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function createWorkflowKeybindingRule(
  workflowId: string,
  key: string,
  when = DEFAULT_WORKFLOW_KEYBINDING_WHEN
): WorkflowKeybindingRule {
  return {
    key: normalizeWorkflowKeybinding(key),
    command: WORKFLOW_KEYBINDING_COMMAND,
    args: workflowId,
    when,
  };
}

export function upsertWorkflowKeybindingRule(
  rules: WorkflowKeybindingRule[],
  nextRule: WorkflowKeybindingRule
): WorkflowKeybindingRule[] {
  return [...rules.filter(rule => !isSameWorkflowBinding(rule, nextRule)), nextRule];
}

// 使用 jsonc-parser 做结构化编辑，尽量保留用户 keybindings.json 里的注释和格式。
export function updateKeybindingsJsonText(text: string, nextRule: WorkflowKeybindingRule): string {
  const source = text.trim() ? text : '[]\n';
  const root = parseTree(source);
  if (!root || root.type !== 'array') {
    throw new Error('Keybindings file must contain a JSON array.');
  }

  let updated = source;
  const formattingOptions = { insertSpaces: true, tabSize: 2, eol: '\n' };
  const matchingIndexes = (root.children ?? [])
    .map((node, index) => ({ index, value: getNodeValue(node) }))
    .filter(item => isSameWorkflowBinding(item.value, nextRule))
    .map(item => item.index)
    .sort((left, right) => right - left);

  for (const index of matchingIndexes) {
    updated = applyEdits(updated, modify(updated, [index], undefined, { formattingOptions }));
  }

  const updatedRoot = parseTree(updated);
  if (!updatedRoot || updatedRoot.type !== 'array') {
    throw new Error('Keybindings file must contain a JSON array.');
  }
  const insertIndex = updatedRoot.children?.length ?? 0;
  const existingNode = findNodeAtLocation(updatedRoot, [insertIndex]);
  if (existingNode) {
    throw new Error('Could not append workflow keybinding.');
  }

  return applyEdits(updated, modify(updated, [-1], nextRule, { formattingOptions }));
}

// 定位到数组闭合括号前，让 VS Code 原生控件插入一条完整 keybinding 对象。
export function findKeybindingsInsertionOffset(text: string): number | undefined {
  const root = parseTree(text);
  if (!root || root.type !== 'array') {
    return undefined;
  }
  return root.offset + root.length - 1;
}

// VS Code 原生 Define Keybinding 会插入默认模板，这里把捕获到的按键迁移到工作流规则上。
export function finalizeNativeWorkflowKeybindingText(
  text: string,
  workflowId: string
): { text: string; key: string } | undefined {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors);
  if (errors.length > 0 || !root || root.type !== 'array') {
    return undefined;
  }

  const entries = (root.children ?? []).map((node, index) => ({ index, value: getNodeValue(node) }));
  const nativeTemplate = entries
    .filter(item => isNativeDefineKeybindingTemplate(item.value))
    .sort((left, right) => right.index - left.index)[0];
  const key = getRuleKey(nativeTemplate?.value);
  if (!nativeTemplate || !key) {
    return undefined;
  }

  const workflowRule = createWorkflowKeybindingRule(workflowId, key);
  const formattingOptions = { insertSpaces: true, tabSize: 2, eol: '\n' };
  let updated = applyEdits(text, modify(text, [nativeTemplate.index], workflowRule, { formattingOptions }));
  const updatedRoot = parseTree(updated);
  if (!updatedRoot || updatedRoot.type !== 'array') {
    return undefined;
  }

  const duplicateIndexes = (updatedRoot.children ?? [])
    .map((node, index) => ({ index, value: getNodeValue(node) }))
    .filter(item => item.index !== nativeTemplate.index && isSameWorkflowBinding(item.value, workflowRule))
    .map(item => item.index)
    .sort((left, right) => right - left);
  for (const index of duplicateIndexes) {
    updated = applyEdits(updated, modify(updated, [index], undefined, { formattingOptions }));
  }

  return { text: updated, key: workflowRule.key };
}

function isSameWorkflowBinding(left: unknown, right: WorkflowKeybindingRule): boolean {
  if (!left || typeof left !== 'object' || Array.isArray(left)) {
    return false;
  }
  const rule = left as WorkflowKeybindingRule;
  return rule.command === right.command && rule.args === right.args;
}

function isNativeDefineKeybindingTemplate(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const rule = value as WorkflowKeybindingRule;
  return (
    rule.command === 'commandId' &&
    rule.when === 'editorTextFocus' &&
    typeof rule.key === 'string' &&
    rule.key.length > 0
  );
}

function getRuleKey(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const key = (value as WorkflowKeybindingRule).key;
  return typeof key === 'string' ? key : undefined;
}
