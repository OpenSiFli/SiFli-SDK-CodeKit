import * as assert from 'assert';
import { describe, it } from 'mocha';
import {
  createWorkflowKeybindingRule,
  findKeybindingsInsertionOffset,
  finalizeNativeWorkflowKeybindingText,
  normalizeWorkflowKeybinding,
  updateKeybindingsJsonText,
  upsertWorkflowKeybindingRule,
} from '../utils/workflowKeybindingUtils';

describe('workflowKeybindingUtils', () => {
  it('normalizes semicolon-separated chord input to VS Code keybinding syntax', () => {
    assert.strictEqual(normalizeWorkflowKeybinding(' Ctrl+X; F1 '), 'ctrl+x f1');
  });

  it('creates a workflow run keybinding rule with workflow id arguments', () => {
    assert.deepStrictEqual(createWorkflowKeybindingRule('flash-and-monitor', 'ctrl+x f1'), {
      key: 'ctrl+x f1',
      command: 'extension.workflows.run',
      args: 'flash-and-monitor',
      when: 'sifli.isProject',
    });
  });

  it('replaces an existing binding for the same workflow and keeps unrelated rules', () => {
    const updated = upsertWorkflowKeybindingRule(
      [
        createWorkflowKeybindingRule('flash-and-monitor', 'ctrl+x f1'),
        createWorkflowKeybindingRule('build-only', 'ctrl+x f2'),
      ],
      createWorkflowKeybindingRule('flash-and-monitor', 'ctrl+x f3')
    );

    assert.deepStrictEqual(updated, [
      createWorkflowKeybindingRule('build-only', 'ctrl+x f2'),
      createWorkflowKeybindingRule('flash-and-monitor', 'ctrl+x f3'),
    ]);
  });

  it('updates keybindings JSONC text while preserving leading comments', () => {
    const updated = updateKeybindingsJsonText(
      [
        '// Place your key bindings in this file to override the defaults',
        '[',
        '  {',
        '    "key": "ctrl+x f1",',
        '    "command": "extension.workflows.run",',
        '    "args": "flash-and-monitor",',
        '    "when": "sifli.isProject"',
        '  }',
        ']',
      ].join('\n'),
      createWorkflowKeybindingRule('flash-and-monitor', 'ctrl+x f3')
    );

    assert.match(updated, /^\/\/ Place your key bindings/m);
    assert.match(updated, /"key": "ctrl\+x f3"/);
    assert.doesNotMatch(updated, /"key": "ctrl\+x f1"/);
  });

  it('finds the insertion offset before the closing keybindings array bracket', () => {
    const text = '[\n  {\n    "key": "ctrl+x f1",\n    "command": "workbench.action.files.save"\n  }\n]';

    assert.strictEqual(findKeybindingsInsertionOffset(text), text.lastIndexOf(']'));
  });

  it('replaces the native Define Keybinding template with the workflow rule', () => {
    const finalized = finalizeNativeWorkflowKeybindingText(
      [
        '[',
        '  {',
        '    "key": "cmd+shift+2",',
        '    "command": "commandId",',
        '    "when": "editorTextFocus"',
        '  }',
        ']',
      ].join('\n'),
      'flash-and-monitor'
    );

    assert.ok(finalized);
    assert.strictEqual(finalized.key, 'cmd+shift+2');
    assert.match(finalized.text, /"command": "extension\.workflows\.run"/);
    assert.match(finalized.text, /"args": "flash-and-monitor"/);
    assert.match(finalized.text, /"when": "sifli\.isProject"/);
    assert.doesNotMatch(finalized.text, /"command": "commandId"/);
  });

  it('removes the previous binding when replacing a native template for the same workflow', () => {
    const finalized = finalizeNativeWorkflowKeybindingText(
      [
        '[',
        '  {',
        '    "key": "ctrl+x f1",',
        '    "command": "extension.workflows.run",',
        '    "args": "flash-and-monitor",',
        '    "when": "sifli.isProject"',
        '  },',
        '  {',
        '    "key": "cmd+shift+2",',
        '    "command": "commandId",',
        '    "when": "editorTextFocus"',
        '  }',
        ']',
      ].join('\n'),
      'flash-and-monitor'
    );

    assert.ok(finalized);
    assert.strictEqual(finalized.key, 'cmd+shift+2');
    assert.doesNotMatch(finalized.text, /ctrl\+x f1/);
    assert.match(finalized.text, /"args": "flash-and-monitor"/);
  });

  it('does not finalize malformed keybindings JSONC while native edits are still settling', () => {
    const finalized = finalizeNativeWorkflowKeybindingText(
      [
        '[',
        '  {',
        '    "key": "alt+e",',
        '    "command": "extension.workflows.run",',
        '    "args": "flash-and-monitor",',
        '    "when": "sifli.isProject"',
        '  }',
        '}',
        ']',
      ].join('\n'),
      'flash-and-monitor'
    );

    assert.strictEqual(finalized, undefined);
  });
});
