export interface BuildLogTextEntry {
  message: string;
}

const ANSI_ESCAPE_PATTERN =
  /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export function formatBuildLogText(entries: BuildLogTextEntry[]): string {
  return entries.map(entry => normalizeBuildLogMessage(entry.message)).join('\n');
}

export function normalizeBuildLogMessage(message: string): string {
  return stripAnsiSequences(message).replace(/\r\n?/g, '\n');
}

export function stripAnsiSequences(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, '');
}
