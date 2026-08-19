import * as assert from 'assert';
import { describe, it } from 'mocha';

type MessageListener = (message: Record<string, unknown>) => void;

class FakeDisposable {
  public constructor(private readonly onDispose: () => void = () => undefined) {}

  public dispose(): void {
    this.onDispose();
  }
}

class FakeEventEmitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  public readonly event = (listener: (value: T) => void): FakeDisposable => {
    this.listeners.add(listener);
    return new FakeDisposable(() => this.listeners.delete(listener));
  };

  public fire(value: T): void {
    this.listeners.forEach(listener => listener(value));
  }

  public dispose(): void {
    this.listeners.clear();
  }
}

class FakeWebview {
  public html = '';
  public readonly messages: unknown[] = [];
  private readonly messageListeners = new Set<MessageListener>();

  public postMessage(message: unknown): Thenable<boolean> {
    this.messages.push(message);
    return Promise.resolve(true);
  }

  public onDidReceiveMessage(listener: MessageListener): FakeDisposable {
    this.messageListeners.add(listener);
    return new FakeDisposable(() => this.messageListeners.delete(listener));
  }
}

class FakeWebviewPanel {
  public readonly webview = new FakeWebview();
  private readonly disposeListeners = new Set<() => void>();

  public constructor(public title: string) {}

  public reveal(): void {
    // The test only needs to retain the panel instance.
  }

  public onDidDispose(listener: () => void): FakeDisposable {
    this.disposeListeners.add(listener);
    return new FakeDisposable(() => this.disposeListeners.delete(listener));
  }
}

class FakeSerialPort {
  public static readonly instances: FakeSerialPort[] = [];

  public static async list(): Promise<Array<{ path: string; manufacturer: string }>> {
    return [{ path: '/dev/fake-serial', manufacturer: 'Fake Serial' }];
  }

  public isOpen = false;
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  public constructor(public readonly options: { path: string }) {
    FakeSerialPort.instances.push(this);
  }

  public on(event: string, listener: (...args: unknown[]) => void): this {
    const eventListeners = this.listeners.get(event) ?? new Set<(...args: unknown[]) => void>();
    eventListeners.add(listener);
    this.listeners.set(event, eventListeners);
    return this;
  }

  public open(callback: (error: Error | null) => void): void {
    this.isOpen = true;
    callback(null);
  }

  public close(callback: (error: Error | null) => void): void {
    this.isOpen = false;
    this.emit('close');
    callback(null);
  }

  public set(_signals: unknown, callback: (error: Error | null) => void): void {
    callback(null);
  }

  public emitData(data: Buffer): void {
    this.emit('data', data);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach(listener => listener(...args));
  }
}

function loadBuiltinSerialMonitorService() {
  const moduleLoader = require('module') as {
    _load: (request: string, parent: NodeModule | undefined, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  const panels: FakeWebviewPanel[] = [];
  const serialPortService = {
    monitorSerialPort: undefined as string | undefined,
    monitorBaudRate: 1000000,
  };
  const vscode = {
    EventEmitter: FakeEventEmitter,
    ViewColumn: { Beside: 2 },
    l10n: { t: (message: string) => message },
    env: { language: 'en' },
    workspace: {
      getConfiguration: () => ({
        get: <T>(_key: string, fallback: T): T => fallback,
      }),
    },
    window: {
      createWebviewPanel: (_viewType: string, title: string) => {
        const panel = new FakeWebviewPanel(title);
        panels.push(panel);
        return panel;
      },
    },
  };

  moduleLoader._load = (request, parent, isMain) => {
    if (request === 'vscode') {
      return vscode;
    }
    if (request === 'serialport') {
      return { SerialPort: FakeSerialPort };
    }
    if (request === './serialPortService') {
      return {
        SerialPortService: {
          getInstance: () => serialPortService,
        },
      };
    }
    if (request === './workspaceStateService') {
      return {
        WorkspaceStateService: {
          getInstance: () => ({
            getSerialMonitorShowTimestamp: () => true,
            getSerialMonitorRenderAnsi: () => true,
            getMonitorBaudRate: () => serialPortService.monitorBaudRate,
          }),
        },
      };
    }
    if (request === '../utils/vueWebviewContent') {
      return { getVueWebviewContent: () => '<html></html>' };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../services/builtinSerialMonitorService');
    delete require.cache[modulePath];
    return {
      ...require('../services/builtinSerialMonitorService'),
      panels,
    };
  } finally {
    moduleLoader._load = originalLoad;
  }
}

describe('BuiltinSerialMonitorService', () => {
  it('forwards new serial data after automatically restoring a session in an existing panel', async () => {
    const { BuiltinSerialMonitorService, panels } = loadBuiltinSerialMonitorService();
    const service = BuiltinSerialMonitorService.getInstance();

    const connectionId = await service.connectSerialPort('/dev/fake-serial', 115200, true);
    assert.strictEqual(connectionId, '/dev/fake-serial');
    assert.strictEqual(panels.length, 1);

    await service.closeSerialMonitor(connectionId);
    await service.connectSerialPort('/dev/fake-serial', 115200, true);

    FakeSerialPort.instances[1].emitData(Buffer.from('restored data', 'utf8'));

    assert.ok(
      panels[0].webview.messages.some(
        (message: any) => message.command === 'serialMonitorEntry' && message.entry.text === 'restored data'
      )
    );
  });
});
