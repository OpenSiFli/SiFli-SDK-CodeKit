import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { SerialPort } from 'serialport';
import { formatSerialBufferHex, parseSerialHexInput } from '../utils/serialDataUtils';

export { parseSerialHexInput } from '../utils/serialDataUtils';

type SerialParity = 'none' | 'even' | 'mark' | 'odd' | 'space';
type SerialSendMode = 'text' | 'hex';
type SerialLineEnding = 'none' | 'lf' | 'crlf';
type SerialLogSource = 'device' | 'user' | 'mcp' | 'system' | 'error';

interface SerialOptions {
  baudRate: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: SerialParity;
}

interface SerialControlSignals {
  dtr: boolean;
  rts: boolean;
}

export interface SerialResetOptions {
  dtr?: boolean;
  rts?: boolean;
  activeMs?: number;
  settleMs?: number;
}

export interface SerialWriteOptions {
  mode: SerialSendMode;
  lineEnding?: SerialLineEnding;
  source?: 'user' | 'mcp';
}

export interface SerialLogEntry {
  id: number;
  timestamp: string;
  source: SerialLogSource;
  text: string;
  hex: string;
  byteLength: number;
}

export interface SerialMonitorStatus {
  connectionId?: string;
  connected: boolean;
  port?: string;
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: SerialParity;
  logCount: number;
}

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
}

export interface SerialReadOptions {
  afterId?: number;
  maxEntries?: number;
  consume?: boolean;
}

export interface SerialReadResult {
  connectionId?: string;
  entries: SerialLogEntry[];
  nextAfterId?: number;
}

interface SerialSessionSnapshot {
  status: SerialMonitorStatus;
  entries: SerialLogEntry[];
  defaultLineEnding: SerialLineEnding;
  reset: Required<SerialResetOptions>;
}

const MAX_LOG_ENTRIES = 2000;
const DEFAULT_BAUD_RATE = 1000000;
const DEFAULT_DATA_BITS = 8;
const DEFAULT_STOP_BITS = 1;
const DEFAULT_PARITY: SerialParity = 'none';

function clampPositiveInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

class SerialMonitorSession {
  private readonly onDidReceiveDataEmitter = new vscode.EventEmitter<SerialLogEntry>();
  public readonly onDidReceiveData = this.onDidReceiveDataEmitter.event;

  private readonly onDidChangeStatusEmitter = new vscode.EventEmitter<SerialMonitorStatus>();
  public readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;

  private serialPort?: SerialPort;
  private readonly decoder = new TextDecoder();
  private readonly entries: SerialLogEntry[] = [];
  private nextEntryId = 1;
  private consumedEntryId = 0;
  private closing = false;

  constructor(
    public readonly portPath: string,
    private readonly portLabel: string,
    private readonly options: SerialOptions,
    private readonly initialSignals: SerialControlSignals
  ) {}

  public get connectionId(): string {
    return this.portPath;
  }

  public get isConnected(): boolean {
    return !!this.serialPort?.isOpen;
  }

  public get name(): string {
    return this.portLabel;
  }

  public async open(): Promise<void> {
    if (this.serialPort?.isOpen) {
      return;
    }

    const serialPort = new SerialPort({
      path: this.portPath,
      baudRate: this.options.baudRate,
      dataBits: this.options.dataBits ?? DEFAULT_DATA_BITS,
      stopBits: this.options.stopBits ?? DEFAULT_STOP_BITS,
      parity: this.options.parity ?? DEFAULT_PARITY,
      autoOpen: false,
    });

    serialPort.on('data', (data: Buffer) => this.addDataEntry('device', data));
    serialPort.on('close', () => {
      if (!this.closing) {
        this.addTextEntry('system', vscode.l10n.t('Serial port closed.'));
      }
      this.onDidChangeStatusEmitter.fire(this.getStatus());
    });
    serialPort.on('error', error => {
      this.addTextEntry('error', error.message);
      this.onDidChangeStatusEmitter.fire(this.getStatus());
    });

    this.serialPort = serialPort;

    await new Promise<void>((resolve, reject) => {
      serialPort.open(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await this.applyControlSignals(this.initialSignals);
    this.addTextEntry(
      'system',
      vscode.l10n.t('Connected to {0} at {1} baud.', this.name, String(this.options.baudRate))
    );
    this.onDidChangeStatusEmitter.fire(this.getStatus());
  }

  public async close(): Promise<void> {
    const serialPort = this.serialPort;
    if (!serialPort || !serialPort.isOpen) {
      this.onDidChangeStatusEmitter.fire(this.getStatus());
      return;
    }

    this.closing = true;
    await new Promise<void>((resolve, reject) => {
      serialPort.close(error => {
        this.closing = false;
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    this.addTextEntry('system', vscode.l10n.t('Disconnected from {0}.', this.name));
    this.onDidChangeStatusEmitter.fire(this.getStatus());
  }

  public async write(input: string, options: SerialWriteOptions): Promise<{ bytesWritten: number }> {
    const serialPort = this.ensureOpenPort();
    const payload = this.createPayload(input, options);
    if (payload.length === 0) {
      return { bytesWritten: 0 };
    }

    await new Promise<void>((resolve, reject) => {
      serialPort.write(payload, error => {
        if (error) {
          reject(error);
          return;
        }
        serialPort.drain(drainError => {
          if (drainError) {
            reject(drainError);
            return;
          }
          resolve();
        });
      });
    });

    this.addDataEntry(options.source ?? 'user', payload);
    return { bytesWritten: payload.length };
  }

  public async reset(options: Required<SerialResetOptions>): Promise<void> {
    const serialPort = this.ensureOpenPort();
    const activeSignals = {
      dtr: options.dtr,
      rts: options.rts,
    };

    await this.setSignals(serialPort, activeSignals);
    await this.delay(options.activeMs);
    await this.setSignals(serialPort, this.initialSignals);
    await this.delay(options.settleMs);
    this.addTextEntry('system', vscode.l10n.t('Reset pulse sent.'));
  }

  public clearLog(): void {
    this.entries.splice(0, this.entries.length);
    this.consumedEntryId = 0;
    this.nextEntryId = 1;
  }

  public readEntries(options: SerialReadOptions = {}): SerialReadResult {
    const maxEntries = clampPositiveInteger(options.maxEntries, 100, 1, MAX_LOG_ENTRIES);
    const afterId = options.consume ? this.consumedEntryId : (options.afterId ?? 0);
    const entries = this.entries.filter(entry => entry.id > afterId).slice(-maxEntries);
    const nextAfterId = entries.length > 0 ? entries[entries.length - 1].id : afterId;

    if (options.consume) {
      this.consumedEntryId = nextAfterId;
    }

    return {
      connectionId: this.connectionId,
      entries,
      nextAfterId,
    };
  }

  public getSnapshot(defaultLineEnding: SerialLineEnding, reset: Required<SerialResetOptions>): SerialSessionSnapshot {
    return {
      status: this.getStatus(),
      entries: [...this.entries],
      defaultLineEnding,
      reset,
    };
  }

  public getStatus(): SerialMonitorStatus {
    return {
      connectionId: this.connectionId,
      connected: this.isConnected,
      port: this.portPath,
      baudRate: this.options.baudRate,
      dataBits: this.options.dataBits,
      stopBits: this.options.stopBits,
      parity: this.options.parity,
      logCount: this.entries.length,
    };
  }

  private createPayload(input: string, options: SerialWriteOptions): Buffer {
    if (options.mode === 'hex') {
      return parseSerialHexInput(input);
    }

    const lineEnding = options.lineEnding ?? 'none';
    const suffix = lineEnding === 'crlf' ? '\r\n' : lineEnding === 'lf' ? '\n' : '';
    return Buffer.from(`${input}${suffix}`, 'utf8');
  }

  private ensureOpenPort(): SerialPort {
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error(vscode.l10n.t('Serial port is not connected.'));
    }
    return this.serialPort;
  }

  private async applyControlSignals(signals: SerialControlSignals): Promise<void> {
    const serialPort = this.ensureOpenPort();
    await this.setSignals(serialPort, signals);
  }

  private async setSignals(serialPort: SerialPort, signals: SerialControlSignals): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      serialPort.set({ dtr: signals.dtr, rts: signals.rts }, error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private addDataEntry(source: SerialLogSource, data: Buffer): void {
    const text = this.decoder.decode(data, { stream: source === 'device' });
    this.addEntry({
      source,
      text,
      hex: formatSerialBufferHex(data),
      byteLength: data.length,
    });
  }

  private addTextEntry(source: SerialLogSource, text: string): void {
    const data = Buffer.from(text, 'utf8');
    this.addEntry({
      source,
      text,
      hex: formatSerialBufferHex(data),
      byteLength: data.length,
    });
  }

  private addEntry(input: Omit<SerialLogEntry, 'id' | 'timestamp'>): void {
    const entry: SerialLogEntry = {
      ...input,
      id: this.nextEntryId++,
      timestamp: new Date().toISOString(),
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries.shift();
    }
    this.onDidReceiveDataEmitter.fire(entry);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  public dispose(): void {
    this.onDidReceiveDataEmitter.dispose();
    this.onDidChangeStatusEmitter.dispose();
  }
}

export class BuiltinSerialMonitorService {
  private static instance: BuiltinSerialMonitorService;
  private readonly sessions = new Map<string, SerialMonitorSession>();
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly panelDisposables = new Map<string, vscode.Disposable[]>();
  private readonly onDidChangeActiveSessionEmitter = new vscode.EventEmitter<SerialMonitorStatus>();
  public readonly onDidChangeActiveSession = this.onDidChangeActiveSessionEmitter.event;
  private defaultBaudRate = DEFAULT_BAUD_RATE;

  private constructor() {}

  public static getInstance(): BuiltinSerialMonitorService {
    if (!BuiltinSerialMonitorService.instance) {
      BuiltinSerialMonitorService.instance = new BuiltinSerialMonitorService();
    }
    return BuiltinSerialMonitorService.instance;
  }

  public async listSerialPorts(): Promise<SerialPortInfo[]> {
    try {
      const ports = await SerialPort.list();
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
      }));
    } catch (error) {
      console.error('Failed to list serial ports:', error);
      return [];
    }
  }

  public async connectSerialPort(
    portPath: string,
    baudRate: number = this.defaultBaudRate,
    revealMonitor = false,
    title: string = vscode.l10n.t('SiFli Serial Monitor')
  ): Promise<string | undefined> {
    try {
      const selectedPortInfo = await this.resolvePortInfo(portPath);
      const existingSession = this.sessions.get(selectedPortInfo.path);
      if (existingSession?.isConnected) {
        if (revealMonitor) {
          this.revealOrCreatePanel(existingSession, title);
        }
        this.onDidChangeActiveSessionEmitter.fire(existingSession.getStatus());
        return existingSession.connectionId;
      }

      if (existingSession) {
        this.disposeSession(existingSession.connectionId);
      }

      const options: SerialOptions = {
        baudRate,
        dataBits: DEFAULT_DATA_BITS,
        stopBits: DEFAULT_STOP_BITS,
        parity: DEFAULT_PARITY,
      };
      const session = new SerialMonitorSession(
        selectedPortInfo.path,
        this.formatPortName(selectedPortInfo),
        options,
        this.readInitialControlSignals()
      );

      await session.open();
      this.sessions.set(session.connectionId, session);

      if (revealMonitor) {
        this.revealOrCreatePanel(session, title);
      }

      this.onDidChangeActiveSessionEmitter.fire(session.getStatus());
      return session.connectionId;
    } catch (error) {
      console.error('Failed to open serial monitor:', error);
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to open serial monitor: {0}', String(error)));
      return undefined;
    }
  }

  public async openSerialMonitor(
    portPath?: string,
    baudRate: number = this.defaultBaudRate,
    title: string = vscode.l10n.t('SiFli Serial Monitor')
  ): Promise<string | undefined> {
    const selectedPort = portPath ?? (await this.pickSerialPort());
    if (!selectedPort) {
      return undefined;
    }
    return this.connectSerialPort(selectedPort, baudRate, true, title);
  }

  public async closeSerialMonitor(connectionId: string): Promise<boolean> {
    try {
      const session = this.sessions.get(connectionId);
      if (!session) {
        return true;
      }

      await session.close();
      this.disposeSession(connectionId);
      return true;
    } catch (error) {
      console.error('Failed to close serial monitor:', error);
      return false;
    }
  }

  public async closeAllSerialMonitors(): Promise<void> {
    const handles = Array.from(this.sessions.keys());
    for (const handle of handles) {
      await this.closeSerialMonitor(handle);
    }
  }

  public async writeSerialData(
    connectionId: string,
    input: string,
    options: SerialWriteOptions
  ): Promise<{ bytesWritten: number }> {
    return this.getRequiredSession(connectionId).write(input, options);
  }

  public async resetSerialDevice(connectionId: string, options?: SerialResetOptions): Promise<void> {
    await this.getRequiredSession(connectionId).reset(this.resolveResetOptions(options));
  }

  public readSerialData(connectionId: string, options?: SerialReadOptions): SerialReadResult {
    return this.getRequiredSession(connectionId).readEntries(options);
  }

  public clearSerialLog(connectionId: string): void {
    this.getRequiredSession(connectionId).clearLog();
    this.postSnapshot(connectionId);
  }

  public getSerialStatus(connectionId?: string): SerialMonitorStatus {
    const session = connectionId ? this.sessions.get(connectionId) : this.getFirstActiveSession();
    if (!session) {
      return {
        connected: false,
        logCount: 0,
      };
    }
    return session.getStatus();
  }

  public getActiveConnectionCount(): number {
    return Array.from(this.sessions.values()).filter(session => session.isConnected).length;
  }

  public setDefaultBaudRate(baudRate: number): void {
    this.defaultBaudRate = baudRate;
  }

  private async pickSerialPort(): Promise<string | undefined> {
    const ports = await this.listSerialPorts();
    if (ports.length === 0) {
      vscode.window.showErrorMessage(vscode.l10n.t('No serial ports found'));
      return undefined;
    }

    const portItems = ports.map(port => ({
      label: port.path,
      description: port.manufacturer || vscode.l10n.t('Unknown'),
      detail: port.serialNumber ? vscode.l10n.t('Serial: {0}', port.serialNumber) : '',
    }));

    const selected = await vscode.window.showQuickPick(portItems, {
      placeHolder: vscode.l10n.t('Select a serial port to monitor'),
    });

    return selected?.label;
  }

  private async resolvePortInfo(portPath: string): Promise<SerialPortInfo> {
    const ports = await this.listSerialPorts();
    return ports.find(port => port.path === portPath) ?? { path: portPath };
  }

  private formatPortName(portInfo: { path: string; manufacturer?: string; serialNumber?: string }): string {
    return portInfo.manufacturer || portInfo.serialNumber
      ? `${portInfo.path} (${portInfo.manufacturer || portInfo.serialNumber})`
      : portInfo.path;
  }

  private getRequiredSession(connectionId: string): SerialMonitorSession {
    const session = this.sessions.get(connectionId);
    if (!session) {
      throw new Error(vscode.l10n.t('Serial monitor session not found: {0}', connectionId));
    }
    return session;
  }

  private getFirstActiveSession(): SerialMonitorSession | undefined {
    return Array.from(this.sessions.values()).find(session => session.isConnected);
  }

  private readInitialControlSignals(): SerialControlSignals {
    const configuration = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    return {
      dtr: configuration.get<boolean>('serialMonitor.openDtr', false),
      rts: configuration.get<boolean>('serialMonitor.openRts', false),
    };
  }

  private readDefaultLineEnding(): SerialLineEnding {
    const value = vscode.workspace
      .getConfiguration('sifli-sdk-codekit')
      .get<string>('serialMonitor.lineEnding', 'crlf');
    return value === 'none' || value === 'lf' || value === 'crlf' ? value : 'crlf';
  }

  private resolveResetOptions(overrides?: SerialResetOptions): Required<SerialResetOptions> {
    const configuration = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    return {
      dtr: overrides?.dtr ?? configuration.get<boolean>('serialMonitor.resetDtr', true),
      rts: overrides?.rts ?? configuration.get<boolean>('serialMonitor.resetRts', false),
      activeMs: clampPositiveInteger(
        overrides?.activeMs,
        configuration.get<number>('serialMonitor.resetActiveMs', 100),
        10,
        5000
      ),
      settleMs: clampPositiveInteger(
        overrides?.settleMs,
        configuration.get<number>('serialMonitor.resetSettleMs', 100),
        0,
        10000
      ),
    };
  }

  private revealOrCreatePanel(session: SerialMonitorSession, title: string): void {
    const existingPanel = this.panels.get(session.connectionId);
    if (existingPanel) {
      existingPanel.reveal(vscode.ViewColumn.Beside);
      this.postSnapshot(session.connectionId);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'sifliSerialMonitor',
      `${title}: ${session.name}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panels.set(session.connectionId, panel);
    panel.webview.html = this.createWebviewHtml(
      panel.webview,
      session.getSnapshot(this.readDefaultLineEnding(), this.resolveResetOptions())
    );

    const disposables: vscode.Disposable[] = [
      session.onDidReceiveData(entry => {
        this.postToPanel(session.connectionId, { type: 'entry', entry });
      }),
      session.onDidChangeStatus(status => {
        this.postToPanel(session.connectionId, { type: 'status', status });
      }),
      panel.webview.onDidReceiveMessage(message => {
        void this.handleWebviewMessage(session.connectionId, message);
      }),
      panel.onDidDispose(() => {
        this.panels.delete(session.connectionId);
        this.disposePanelDisposables(session.connectionId);
      }),
    ];
    this.panelDisposables.set(session.connectionId, disposables);
  }

  private async handleWebviewMessage(connectionId: string, message: Record<string, unknown>): Promise<void> {
    const command = typeof message.command === 'string' ? message.command : '';
    try {
      switch (command) {
        case 'ready':
          this.postSnapshot(connectionId);
          break;
        case 'send':
          await this.writeSerialData(connectionId, String(message.payload ?? ''), {
            mode: message.mode === 'hex' ? 'hex' : 'text',
            lineEnding: this.normalizeLineEnding(message.lineEnding),
            source: 'user',
          });
          break;
        case 'reset':
          await this.resetSerialDevice(connectionId);
          break;
        case 'disconnect':
          await this.closeSerialMonitor(connectionId);
          break;
        case 'clear':
          this.clearSerialLog(connectionId);
          break;
        default:
          break;
      }
    } catch (error) {
      this.postToPanel(connectionId, {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private normalizeLineEnding(value: unknown): SerialLineEnding {
    return value === 'none' || value === 'lf' || value === 'crlf' ? value : this.readDefaultLineEnding();
  }

  private postSnapshot(connectionId: string): void {
    const session = this.sessions.get(connectionId);
    if (!session) {
      this.postToPanel(connectionId, {
        type: 'status',
        status: {
          connected: false,
          logCount: 0,
        } satisfies SerialMonitorStatus,
      });
      return;
    }

    this.postToPanel(connectionId, {
      type: 'snapshot',
      snapshot: session.getSnapshot(this.readDefaultLineEnding(), this.resolveResetOptions()),
    });
  }

  private postToPanel(connectionId: string, payload: unknown): void {
    const panel = this.panels.get(connectionId);
    if (!panel) {
      return;
    }
    void panel.webview.postMessage(payload);
  }

  private disposeSession(connectionId: string): void {
    const session = this.sessions.get(connectionId);
    session?.dispose();
    this.sessions.delete(connectionId);

    const panel = this.panels.get(connectionId);
    if (panel) {
      this.postToPanel(connectionId, {
        type: 'status',
        status: {
          connected: false,
          logCount: 0,
        } satisfies SerialMonitorStatus,
      });
    }
  }

  private disposePanelDisposables(connectionId: string): void {
    const disposables = this.panelDisposables.get(connectionId) ?? [];
    disposables.forEach(disposable => disposable.dispose());
    this.panelDisposables.delete(connectionId);
  }

  private createWebviewHtml(webview: vscode.Webview, snapshot: SerialSessionSnapshot): string {
    const nonce = randomUUID();
    const initialState = JSON.stringify(snapshot).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SiFli Serial Monitor</title>
  <style>
    :root {
      color-scheme: light dark;
      --monitor-border: var(--vscode-panel-border);
      --monitor-muted: var(--vscode-descriptionForeground);
      --monitor-bg-soft: var(--vscode-sideBar-background);
      --monitor-row: color-mix(in srgb, var(--vscode-editor-foreground) 6%, transparent);
      --monitor-accent: var(--vscode-button-background);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      min-height: 100vh;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    button,
    select,
    textarea {
      font: inherit;
    }

    button,
    select {
      height: 30px;
    }

    button {
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border-radius: 4px;
      padding: 0 10px;
      cursor: pointer;
    }

    button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    button:disabled {
      cursor: default;
      opacity: 0.55;
    }

    select,
    textarea {
      border: 1px solid var(--vscode-input-border, var(--monitor-border));
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
    }

    .shell {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      min-height: 100vh;
    }

    .toolbar,
    .composer {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--monitor-border);
      background: var(--monitor-bg-soft);
    }

    .composer {
      align-items: stretch;
      border-top: 1px solid var(--monitor-border);
      border-bottom: 0;
    }

    .status {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      color: var(--monitor-muted);
    }

    .status strong {
      color: var(--vscode-editor-foreground);
      font-weight: 600;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 22px;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--vscode-testing-iconErrored);
    }

    .dot.connected {
      background: var(--vscode-testing-iconPassed);
    }

    .log {
      min-height: 0;
      overflow: auto;
      padding: 10px 12px 16px;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.45;
    }

    .entry {
      display: grid;
      grid-template-columns: 82px 72px minmax(0, 1fr);
      gap: 10px;
      padding: 5px 6px;
      border-bottom: 1px solid var(--monitor-row);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .time,
    .source,
    .hex {
      color: var(--monitor-muted);
    }

    .source {
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0;
    }

    .source.device {
      color: var(--vscode-terminal-ansiGreen);
    }

    .source.user,
    .source.mcp {
      color: var(--vscode-terminal-ansiCyan);
    }

    .source.error {
      color: var(--vscode-errorForeground);
    }

    .payload {
      min-width: 0;
    }

    .hex {
      display: none;
      margin-top: 3px;
      font-size: 11px;
    }

    .show-hex .hex {
      display: block;
    }

    textarea {
      flex: 1;
      min-height: 46px;
      max-height: 120px;
      resize: vertical;
      padding: 8px;
      line-height: 1.35;
      font-family: var(--vscode-editor-font-family);
    }

    .composer-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 112px;
    }

    .error-banner {
      display: none;
      padding: 8px 12px;
      color: var(--vscode-inputValidation-errorForeground);
      background: var(--vscode-inputValidation-errorBackground);
      border-bottom: 1px solid var(--vscode-inputValidation-errorBorder);
    }

    .error-banner.visible {
      display: block;
    }

    @media (max-width: 720px) {
      .toolbar,
      .composer {
        flex-wrap: wrap;
      }

      .entry {
        grid-template-columns: 72px minmax(0, 1fr);
      }

      .source {
        grid-column: 2;
        grid-row: 1;
      }

      .payload {
        grid-column: 1 / -1;
      }

      .composer-actions {
        flex-direction: row;
        width: 100%;
      }

      .composer-actions button {
        flex: 1;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="toolbar">
      <div class="status">
        <span class="pill"><span id="dot" class="dot"></span><strong id="connection">Disconnected</strong></span>
        <span id="port"></span>
        <span id="baud"></span>
        <span id="count"></span>
      </div>
      <select id="mode" title="Input mode">
        <option value="text">String</option>
        <option value="hex">HEX</option>
      </select>
      <select id="lineEnding" title="Line ending">
        <option value="none">No EOL</option>
        <option value="lf">LF</option>
        <option value="crlf">CRLF</option>
      </select>
      <button id="toggleHex" title="Show or hide HEX bytes">HEX View</button>
      <button id="clear" title="Clear monitor log">Clear</button>
      <button id="reset" title="Pulse configured DTR/RTS reset signals">Reset</button>
      <button id="disconnect" title="Disconnect serial port">Disconnect</button>
    </header>
    <div id="error" class="error-banner"></div>
    <main id="log" class="log"></main>
    <footer class="composer">
      <textarea id="input" spellcheck="false" placeholder="Type string data or HEX bytes"></textarea>
      <div class="composer-actions">
        <button id="send" class="primary" title="Send data">Send</button>
      </div>
    </footer>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${initialState};
    let entries = [];
    let showHex = false;

    const log = document.getElementById('log');
    const input = document.getElementById('input');
    const mode = document.getElementById('mode');
    const lineEnding = document.getElementById('lineEnding');
    const error = document.getElementById('error');

    function renderSnapshot(snapshot) {
      state = snapshot;
      entries = snapshot.entries || [];
      lineEnding.value = snapshot.defaultLineEnding || 'crlf';
      renderStatus(snapshot.status);
      renderEntries();
    }

    function renderStatus(status) {
      const connected = !!status.connected;
      document.getElementById('dot').classList.toggle('connected', connected);
      document.getElementById('connection').textContent = connected ? 'Connected' : 'Disconnected';
      document.getElementById('port').textContent = status.port ? status.port : '';
      document.getElementById('baud').textContent = status.baudRate ? status.baudRate + ' baud' : '';
      document.getElementById('count').textContent = (status.logCount || entries.length || 0) + ' entries';
      document.getElementById('send').disabled = !connected;
      document.getElementById('reset').disabled = !connected;
      document.getElementById('disconnect').disabled = !connected;
    }

    function renderEntries() {
      log.classList.toggle('show-hex', showHex);
      log.replaceChildren(...entries.map(renderEntry));
      log.scrollTop = log.scrollHeight;
    }

    function renderEntry(entry) {
      const row = document.createElement('div');
      row.className = 'entry';

      const time = document.createElement('div');
      time.className = 'time';
      time.textContent = new Date(entry.timestamp).toLocaleTimeString();

      const source = document.createElement('div');
      source.className = 'source ' + entry.source;
      source.textContent = entry.source;

      const payload = document.createElement('div');
      payload.className = 'payload';
      const text = document.createElement('div');
      text.textContent = entry.text || '';
      const hex = document.createElement('div');
      hex.className = 'hex';
      hex.textContent = entry.hex || '';
      payload.append(text, hex);

      row.append(time, source, payload);
      return row;
    }

    function showError(message) {
      error.textContent = message || '';
      error.classList.toggle('visible', !!message);
      if (message) {
        setTimeout(() => showError(''), 6000);
      }
    }

    document.getElementById('send').addEventListener('click', () => {
      vscode.postMessage({
        command: 'send',
        payload: input.value,
        mode: mode.value,
        lineEnding: lineEnding.value
      });
      input.value = '';
      input.focus();
    });

    input.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('send').click();
      }
    });

    document.getElementById('reset').addEventListener('click', () => vscode.postMessage({ command: 'reset' }));
    document.getElementById('disconnect').addEventListener('click', () => vscode.postMessage({ command: 'disconnect' }));
    document.getElementById('clear').addEventListener('click', () => vscode.postMessage({ command: 'clear' }));
    document.getElementById('toggleHex').addEventListener('click', () => {
      showHex = !showHex;
      renderEntries();
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'snapshot') {
        renderSnapshot(message.snapshot);
      } else if (message.type === 'entry') {
        entries.push(message.entry);
        if (entries.length > 2000) {
          entries.shift();
        }
        renderStatus({ ...(state.status || {}), logCount: entries.length });
        log.append(renderEntry(message.entry));
        log.scrollTop = log.scrollHeight;
      } else if (message.type === 'status') {
        state.status = message.status;
        renderStatus(message.status);
      } else if (message.type === 'error') {
        showError(message.message);
      }
    });

    renderSnapshot(state);
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
  }
}
