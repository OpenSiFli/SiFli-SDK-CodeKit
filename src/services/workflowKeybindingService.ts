import * as vscode from 'vscode';
import {
  createWorkflowKeybindingRule,
  findKeybindingsInsertionOffset,
  finalizeNativeWorkflowKeybindingText,
  WorkflowKeybindingRule,
} from '../utils/workflowKeybindingUtils';

export class WorkflowKeybindingService {
  private pendingNativeCapture?: vscode.Disposable;

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public async startNativeKeybindingCapture(workflowId: string): Promise<vscode.Uri> {
    const keybindingsUri = this.getUserKeybindingsUri();
    const currentText = await this.readKeybindingsText(keybindingsUri);
    const nextText = currentText.trim() ? currentText : '[]\n';
    const insertionOffset = findKeybindingsInsertionOffset(nextText);
    if (insertionOffset === undefined) {
      throw new Error(vscode.l10n.t('Could not locate the workflow keybinding entry.'));
    }

    await vscode.workspace.fs.writeFile(keybindingsUri, Buffer.from(nextText, 'utf8'));
    this.watchNativeKeybindingResult(keybindingsUri, workflowId);
    await this.openDefineKeybindingWidget(keybindingsUri, insertionOffset);
    return keybindingsUri;
  }

  public async copyKeybindingSnippet(workflowId: string): Promise<void> {
    const rule = createWorkflowKeybindingRule(workflowId, '');
    await vscode.env.clipboard.writeText(this.formatSnippet(rule));
  }

  public async openUserKeybindings(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.openGlobalKeybindingsFile');
  }

  private getUserKeybindingsUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, '..', '..', 'keybindings.json');
  }

  private async readKeybindingsText(uri: vscode.Uri): Promise<string> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(bytes).toString('utf8');
    } catch {
      return '[]\n';
    }
  }

  private async openDefineKeybindingWidget(uri: vscode.Uri, keyOffset: number): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const position = document.positionAt(keyOffset);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);

    // 借用 VS Code 内置的 Define Keybinding 控件，避免自己维护键盘布局映射。
    await vscode.commands.executeCommand('editor.action.defineKeybinding');
  }

  private watchNativeKeybindingResult(uri: vscode.Uri, workflowId: string): void {
    this.pendingNativeCapture?.dispose();
    let applyingFinalText = false;
    let finalizeTimer: NodeJS.Timeout | undefined;
    const clearFinalizeTimer = () => {
      if (finalizeTimer) {
        clearTimeout(finalizeTimer);
        finalizeTimer = undefined;
      }
    };

    const listener = vscode.workspace.onDidChangeTextDocument(event => {
      if (applyingFinalText || event.document.uri.toString() !== uri.toString()) {
        return;
      }

      clearFinalizeTimer();
      // Define Keybinding 可能分多次修改 JSON，稍等一下再读取完整文档。
      finalizeTimer = setTimeout(() => {
        void this.finalizeNativeKeybindingDocument(
          event.document,
          uri,
          workflowId,
          () => {
            applyingFinalText = true;
          },
          () => {
            applyingFinalText = false;
            this.pendingNativeCapture?.dispose();
            this.pendingNativeCapture = undefined;
          }
        );
      }, 150);
    });

    this.pendingNativeCapture = new vscode.Disposable(() => {
      clearFinalizeTimer();
      listener.dispose();
    });
  }

  private async finalizeNativeKeybindingDocument(
    document: vscode.TextDocument,
    uri: vscode.Uri,
    workflowId: string,
    beforeApply: () => void,
    afterApply: () => void
  ): Promise<void> {
    const finalized = finalizeNativeWorkflowKeybindingText(document.getText(), workflowId);
    if (!finalized) {
      return;
    }

    beforeApply();
    try {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        uri,
        new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
        finalized.text
      );
      await vscode.workspace.applyEdit(edit);
      await document.save();
      vscode.window
        .showInformationMessage(
          vscode.l10n.t('Keyboard shortcut {0} was set for workflow {1}.', finalized.key, workflowId),
          vscode.l10n.t('Open JSON')
        )
        .then(selection => {
          if (selection) {
            this.openUserKeybindings();
          }
        });
    } finally {
      afterApply();
    }
  }

  private formatSnippet(rule: WorkflowKeybindingRule): string {
    return JSON.stringify(rule, null, 2);
  }
}
