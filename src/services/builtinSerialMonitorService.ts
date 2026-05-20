import * as vscode from 'vscode';
import { SerialPort } from 'serialport';
import { formatSerialBufferHex, parseSerialHexInput } from '../utils/serialDataUtils';
import { getVueWebviewContent } from '../utils/vueWebviewContent';
import { WorkspaceStateService } from './workspaceStateService';

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

export interface SerialMonitorSettings {
  showTimestamp: boolean;
}

interface SerialSessionSnapshot {
  status: SerialMonitorStatus;
  entries: SerialLogEntry[];
  ports: SerialPortInfo[];
  defaultLineEnding: SerialLineEnding;
  reset: Required<SerialResetOptions>;
  settings: SerialMonitorSettings;
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

  public getSnapshot(
    defaultLineEnding: SerialLineEnding,
    reset: Required<SerialResetOptions>,
    ports: SerialPortInfo[],
    settings: SerialMonitorSettings
  ): SerialSessionSnapshot {
    return {
      status: this.getStatus(),
      entries: [...this.entries],
      ports,
      defaultLineEnding,
      reset,
      settings,
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
  private readonly workspaceStateService = WorkspaceStateService.getInstance();
  private defaultBaudRate = DEFAULT_BAUD_RATE;
  private context?: vscode.ExtensionContext;

  private constructor() {}

  public static getInstance(): BuiltinSerialMonitorService {
    if (!BuiltinSerialMonitorService.instance) {
      BuiltinSerialMonitorService.instance = new BuiltinSerialMonitorService();
    }
    return BuiltinSerialMonitorService.instance;
  }

  public setContext(context: vscode.ExtensionContext): void {
    this.context = context;
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
          await this.revealOrCreatePanel(existingSession, title);
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
        await this.revealOrCreatePanel(session, title);
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
    void this.postSnapshot(connectionId);
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

  private async revealOrCreatePanel(session: SerialMonitorSession, title: string): Promise<void> {
    const existingPanel = this.panels.get(session.connectionId);
    if (existingPanel) {
      existingPanel.reveal(vscode.ViewColumn.Beside);
      await this.postSnapshot(session.connectionId);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'sifliSerialMonitor',
      `${title}: ${session.name}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableCommandUris: true,
        localResourceRoots: this.context
          ? [
              vscode.Uri.joinPath(this.context.extensionUri, 'webview-vue', 'dist'),
              vscode.Uri.joinPath(this.context.extensionUri, 'webview-vue', 'dist', 'assets'),
            ]
          : [],
      }
    );

    this.panels.set(session.connectionId, panel);
    panel.webview.html = this.context
      ? getVueWebviewContent(panel.webview, this.context.extensionPath)
      : this.createMissingContextHtml();

    this.bindPanelToSession(panel, session);
  }

  private bindPanelToSession(panel: vscode.WebviewPanel, session: SerialMonitorSession): void {
    const disposables: vscode.Disposable[] = [
      session.onDidReceiveData(entry => {
        this.postToPanel(session.connectionId, { command: 'serialMonitorEntry', entry });
      }),
      session.onDidChangeStatus(status => {
        this.postToPanel(session.connectionId, { command: 'serialMonitorStatus', status });
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
          await this.initializePanelWebview(connectionId);
          break;
        case 'getSerialMonitorSnapshot':
          await this.postSnapshot(connectionId);
          break;
        case 'serialMonitorRefreshPorts':
          await this.postSnapshot(connectionId);
          break;
        case 'serialMonitorUpdateSettings':
          await this.updateMonitorSettings(message.settings);
          await this.postSnapshot(connectionId);
          break;
        case 'serialMonitorChangePort':
          await this.changePanelSerialPort(connectionId, String(message.port ?? ''));
          break;
        case 'serialMonitorSend':
          await this.writeSerialData(connectionId, String(message.payload ?? ''), {
            mode: message.mode === 'hex' ? 'hex' : 'text',
            lineEnding: this.normalizeLineEnding(message.lineEnding),
            source: 'user',
          });
          break;
        case 'serialMonitorReset':
          await this.resetSerialDevice(connectionId);
          break;
        case 'serialMonitorDisconnect':
          await this.closeSerialMonitor(connectionId);
          break;
        case 'serialMonitorClear':
          this.clearSerialLog(connectionId);
          break;
        default:
          break;
      }
    } catch (error) {
      this.postToPanel(connectionId, {
        command: 'serialMonitorError',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async initializePanelWebview(connectionId: string): Promise<void> {
    this.postToPanel(connectionId, {
      command: 'initializeLocale',
      locale: this.getVSCodeLocale(),
    });
    this.postToPanel(connectionId, {
      command: 'navigate',
      route: '/serial-monitor',
    });
    await this.postSnapshot(connectionId);
  }

  private normalizeLineEnding(value: unknown): SerialLineEnding {
    return value === 'none' || value === 'lf' || value === 'crlf' ? value : this.readDefaultLineEnding();
  }

  private async updateMonitorSettings(value: unknown): Promise<void> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }

    const settings = value as Partial<SerialMonitorSettings>;
    if (typeof settings.showTimestamp === 'boolean') {
      await this.workspaceStateService.setSerialMonitorShowTimestamp(settings.showTimestamp);
    }
  }

  private async changePanelSerialPort(connectionId: string, portPath: string): Promise<void> {
    const nextPortPath = portPath.trim();
    if (!nextPortPath) {
      throw new Error(vscode.l10n.t('Select a serial port first.'));
    }

    const panel = this.panels.get(connectionId);
    if (!panel) {
      throw new Error(vscode.l10n.t('Serial monitor panel not found.'));
    }

    const currentSession = this.sessions.get(connectionId);
    if (currentSession?.portPath === nextPortPath && currentSession.isConnected) {
      await this.postSnapshot(connectionId);
      return;
    }

    const baudRate = currentSession?.getStatus().baudRate ?? this.defaultBaudRate;
    const baseTitle = panel.title.includes(':')
      ? panel.title.slice(0, panel.title.indexOf(':')).trim()
      : vscode.l10n.t('SiFli Serial Monitor');

    if (currentSession) {
      await currentSession.close();
      currentSession.dispose();
      this.sessions.delete(connectionId);
    }

    this.disposePanelDisposables(connectionId);
    this.panels.delete(connectionId);

    const selectedPortInfo = await this.resolvePortInfo(nextPortPath);
    const existingSession = this.sessions.get(selectedPortInfo.path);
    if (existingSession) {
      await existingSession.close();
      existingSession.dispose();
      this.sessions.delete(existingSession.connectionId);
      this.disposePanelDisposables(existingSession.connectionId);
      this.panels.delete(existingSession.connectionId);
    }

    const session = new SerialMonitorSession(
      selectedPortInfo.path,
      this.formatPortName(selectedPortInfo),
      {
        baudRate,
        dataBits: DEFAULT_DATA_BITS,
        stopBits: DEFAULT_STOP_BITS,
        parity: DEFAULT_PARITY,
      },
      this.readInitialControlSignals()
    );

    await session.open();
    this.sessions.set(session.connectionId, session);
    this.panels.set(session.connectionId, panel);
    panel.title = `${baseTitle}: ${session.name}`;
    this.bindPanelToSession(panel, session);
    this.onDidChangeActiveSessionEmitter.fire(session.getStatus());
    await this.postSnapshot(session.connectionId);
  }

  private async postSnapshot(connectionId: string): Promise<void> {
    const ports = await this.listSerialPorts();
    const session = this.sessions.get(connectionId);
    if (!session) {
      this.postToPanel(connectionId, {
        command: 'serialMonitorSnapshot',
        snapshot: {
          status: {
            connected: false,
            logCount: 0,
          } satisfies SerialMonitorStatus,
          entries: [],
          ports,
          defaultLineEnding: this.readDefaultLineEnding(),
          reset: this.resolveResetOptions(),
          settings: this.readMonitorSettings(),
        } satisfies SerialSessionSnapshot,
      });
      return;
    }

    this.postToPanel(connectionId, {
      command: 'serialMonitorSnapshot',
      snapshot: session.getSnapshot(
        this.readDefaultLineEnding(),
        this.resolveResetOptions(),
        ports,
        this.readMonitorSettings()
      ),
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
        command: 'serialMonitorStatus',
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

  private getVSCodeLocale(): string {
    const config = vscode.workspace.getConfiguration();
    const locale = config.get<string>('locale') || vscode.env.language || 'en';
    return locale.startsWith('zh') ? 'zh' : 'en';
  }

  private readMonitorSettings(): SerialMonitorSettings {
    return {
      showTimestamp: this.workspaceStateService.getSerialMonitorShowTimestamp(),
    };
  }

  private createMissingContextHtml(): string {
    return '<!doctype html><html><body>Serial monitor webview context is not initialized.</body></html>';
  }
}
