/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as childProcess from 'child_process';
import { existsSync } from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import {
  CancellationToken,
  DebugAdapterTracker,
  DebugAdapterTrackerFactory,
  DebugConfiguration,
  DebugConfigurationProvider,
  ProviderResult,
  WorkspaceFolder,
} from 'vscode';
import { getAvailablePort } from './portUtils';
import { ProbeRsService } from '../services/probeRsService';

const DEBUG_TYPE = 'sifli-probe-rs';
const CONFIG_NAMESPACE = 'sifli-probe-rs';
const UART_CONSOLE_CHANNEL_NUMBER = 2048;
const UART_CONSOLE_CHANNEL_NAME = 'uart';
const RUNTIME_EXECUTABLE_EXPLICIT_KEY = '__sifliRuntimeExecutableExplicit';

export type ProbeRsDidSendMessageListener = (session: vscode.DebugSession, message: unknown) => void;

const probeRsDidSendMessageListeners = new Set<ProbeRsDidSendMessageListener>();

export function onProbeRsDidSendMessage(listener: ProbeRsDidSendMessageListener): vscode.Disposable {
  probeRsDidSendMessageListeners.add(listener);
  return new vscode.Disposable(() => {
    probeRsDidSendMessageListeners.delete(listener);
  });
}

export function registerProbeRsDebugger(context: vscode.ExtensionContext): void {
  const descriptorFactory = new ProbeRSDebugAdapterServerDescriptorFactory();
  const configProvider = new ProbeRSConfigurationProvider();
  const trackerFactory = new ProbeRsDebugAdapterTrackerFactory();

  context.subscriptions.push(
    descriptorFactory,
    vscode.debug.registerDebugAdapterDescriptorFactory(DEBUG_TYPE, descriptorFactory),
    vscode.debug.registerDebugConfigurationProvider(DEBUG_TYPE, configProvider),
    vscode.debug.registerDebugAdapterTrackerFactory(DEBUG_TYPE, trackerFactory),
    vscode.debug.onDidReceiveDebugSessionCustomEvent(descriptorFactory.receivedCustomEvent, descriptorFactory),
    vscode.debug.onDidTerminateDebugSession(descriptorFactory.onDidTerminateDebugSession, descriptorFactory),
    vscode.window.onDidCloseTerminal(descriptorFactory.onDidCloseTerminal, descriptorFactory)
  );
}

// Cleanup inconsistent line breaks in String data
const formatText = (text: string) => `\r${text.split(/(\r?\n)/g).join('\r')}\r`;

// Constant for handling/filtering  console log messages.
const enum ConsoleLogSources {
  error = 'ERROR', // Identifies messages that contain error information.
  warn = 'WARN', // Identifies messages that contain warning information.
  info = 'INFO', // Identifies messages that contain summary level of debug information.
  debug = 'DEBUG', // Identifies messages that contain detailed level debug information.
  console = DEBUG_TYPE, // Identifies messages from the extension or debug adapter that must be sent to the Debug Console.
}

// This is just the default. It will be updated after the configuration has been resolved.
var consoleLogLevel = ConsoleLogSources.console;

// Common handler for error/exit codes
function handleExit(code: number | null, signal: string | null) {
  var actionHint: string = vscode.l10n.t(
    'Please review all the error messages, including those in the "Debug Console" window.'
  );
  if (code) {
    vscode.window.showErrorMessage(
      vscode.l10n.t(
        '{0}: {1} exited with an unexpected code: {2} {3}',
        ConsoleLogSources.error,
        ConsoleLogSources.console,
        String(code),
        actionHint
      )
    );
  } else if (signal) {
    vscode.window.showErrorMessage(
      vscode.l10n.t(
        '{0}: {1} exited with signal: {2} {3}',
        ConsoleLogSources.error,
        ConsoleLogSources.console,
        signal,
        actionHint
      )
    );
  }
}

// Adapted from https://stackoverflow.com/questions/2970525/converting-any-string-into-camel-case
function toCamelCase(str: string) {
  return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match: string, index: number) {
    if (+match === 0) {
      return '';
    } // or if (/\s+/.test(match)) for white spaces
    return index === 0 ? match.toLowerCase() : match.toUpperCase();
  });
}

// Messages to be sent to the debug session's console.
// Any local (generated directly by this extension) messages MUST start with ConsoleLogLevels.error, or ConsoleLogSources.console, or `DEBUG`.
// Any messages that start with ConsoleLogLevels.error or ConsoleLogSources.console will always be logged.
// Any messages that come from the ConsoleLogSources.console STDERR will always be logged.
function logToConsole(consoleMessage: string, fromDebugger: boolean = false) {
  console.log(consoleMessage); // During VSCode extension development, this will also log to the local debug console
  if (fromDebugger) {
    // STDERR messages of the `error` variant. These deserve to be shown as an error message in the UI also.
    // This filter might capture more than expected, but since RUST_LOG messages can take many formats, it seems that this is the safest/most inclusive.
    if (consoleMessage.startsWith(ConsoleLogSources.error)) {
      vscode.debug.activeDebugConsole.appendLine(consoleMessage);
      vscode.window.showErrorMessage(consoleMessage);
    } else {
      // Any other messages that come directly from the debugger, are assumed to be relevant and should be logged to the console.
      vscode.debug.activeDebugConsole.appendLine(consoleMessage);
    }
  } else if (consoleMessage.startsWith(ConsoleLogSources.console)) {
    vscode.debug.activeDebugConsole.appendLine(consoleMessage);
  } else {
    switch (consoleLogLevel) {
      case ConsoleLogSources.debug: //  Log Info, Error AND Debug
        if (
          consoleMessage.startsWith(ConsoleLogSources.console) ||
          consoleMessage.startsWith(ConsoleLogSources.error) ||
          consoleMessage.startsWith(ConsoleLogSources.debug)
        ) {
          vscode.debug.activeDebugConsole.appendLine(consoleMessage);
        }
        break;
      default: // ONLY log console and error messages
        if (
          consoleMessage.startsWith(ConsoleLogSources.console) ||
          consoleMessage.startsWith(ConsoleLogSources.error)
        ) {
          vscode.debug.activeDebugConsole.appendLine(consoleMessage);
        }
        break;
    }
  }
}

interface ProbeRsTerminalEntry {
  sessionId: string;
  session: vscode.DebugSession;
  sessionActive: boolean;
  channelNumber: number;
  channelName: string;
  dataFormat: string;
  terminal: vscode.Terminal;
  channelWriteEmitter: vscode.EventEmitter<string>;
  inputChannel: string | undefined;
  inputEnabled: boolean;
  reportedInputFailure: boolean;
}

class ProbeRSDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory, vscode.Disposable {
  private readonly rttTerminals = new Map<string, ProbeRsTerminalEntry>();
  private readonly terminalKeys = new Map<vscode.Terminal, string>();

  private getTerminalKey(sessionId: string, channelNumber: number): string {
    return `${sessionId}:${channelNumber}`;
  }

  private isUartConsoleChannel(channelNumber: number, channelName: string): boolean {
    return channelNumber === UART_CONSOLE_CHANNEL_NUMBER || channelName === UART_CONSOLE_CHANNEL_NAME;
  }

  private shouldRevealTerminal(channelNumber: number, channelName: string): boolean {
    return channelNumber === 0 || this.isUartConsoleChannel(channelNumber, channelName);
  }

  private supportsProbeRsChannelInput(_session: vscode.DebugSession): boolean {
    return true;
  }

  private getInputChannel(
    session: vscode.DebugSession,
    channelNumber: number,
    channelName: string
  ): string | undefined {
    if (this.isUartConsoleChannel(channelNumber, channelName) && this.supportsProbeRsChannelInput(session)) {
      return UART_CONSOLE_CHANNEL_NAME;
    }
    return undefined;
  }

  private notifyRttWindowState(
    entry: ProbeRsTerminalEntry,
    windowIsOpen: boolean,
    stateDescription: 'opened' | 'closed' | 'reused'
  ): void {
    if (!entry.sessionActive) {
      return;
    }

    void entry.session.customRequest('rttWindowOpened', { channelNumber: entry.channelNumber, windowIsOpen }).then(
      () => {
        const detail = stateDescription === 'closed' ? 'can no longer receive RTT data' : 'ready to receive RTT data';
        logToConsole(
          `${ConsoleLogSources.console}: RTT Window ${stateDescription}, and ${detail} on channel ${JSON.stringify(
            entry.channelNumber,
            null,
            2
          )}`
        );
      },
      (error: unknown) => {
        logToConsole(
          `${ConsoleLogSources.error}: ${ConsoleLogSources.console}: Failed to update RTT window state for channel ${JSON.stringify(
            entry.channelNumber,
            null,
            2
          )}: ${JSON.stringify(String(error))}`
        );
      }
    );
  }

  private handleTerminalInput(entry: ProbeRsTerminalEntry, data: string): void {
    if (data === '\x03') {
      entry.terminal.dispose();
      return;
    }

    if (!entry.sessionActive || !entry.inputEnabled || !entry.inputChannel) {
      return;
    }

    void entry.session
      .customRequest('channelInput', { channel: entry.inputChannel, data })
      .then(undefined, (error: unknown) => {
        if (entry.reportedInputFailure) {
          return;
        }

        entry.reportedInputFailure = true;
        entry.inputEnabled = false;
        logToConsole(
          `${ConsoleLogSources.error}: ${ConsoleLogSources.console}: Failed to forward input to channel ${JSON.stringify(
            entry.inputChannel
          )} on debug session ${JSON.stringify(entry.sessionId)}: ${JSON.stringify(String(error))}`
        );
      });
  }

  private deleteTerminalEntry(key: string): void {
    const entry = this.rttTerminals.get(key);
    if (!entry) {
      return;
    }

    entry.sessionActive = false;
    entry.inputEnabled = false;
    entry.channelWriteEmitter.dispose();
    this.rttTerminals.delete(key);
    this.terminalKeys.delete(entry.terminal);
  }

  private cleanupSession(sessionId: string): void {
    for (const [key, entry] of this.rttTerminals.entries()) {
      if (entry.sessionId === sessionId) {
        this.deleteTerminalEntry(key);
      }
    }
  }

  onDidCloseTerminal(terminal: vscode.Terminal): void {
    const key = this.terminalKeys.get(terminal);
    if (!key) {
      return;
    }

    this.deleteTerminalEntry(key);
  }

  onDidTerminateDebugSession(session: vscode.DebugSession): void {
    if (session.type !== DEBUG_TYPE) {
      return;
    }

    this.cleanupSession(session.id);
  }

  createRttTerminal(session: vscode.DebugSession, channelNumber: number, dataFormat: string, channelName: string) {
    const key = this.getTerminalKey(session.id, channelNumber);
    const existingEntry = this.rttTerminals.get(key);
    if (existingEntry) {
      existingEntry.session = session;
      existingEntry.sessionActive = true;
      existingEntry.channelName = channelName;
      existingEntry.dataFormat = dataFormat;
      existingEntry.inputChannel = this.getInputChannel(session, channelNumber, channelName);
      existingEntry.inputEnabled = existingEntry.inputChannel !== undefined;
      existingEntry.reportedInputFailure = false;
      this.notifyRttWindowState(existingEntry, true, 'reused');
      if (this.shouldRevealTerminal(channelNumber, channelName)) {
        existingEntry.terminal.show(false);
      }
      return;
    }

    const channelWriteEmitter = new vscode.EventEmitter<string>();
    let entry: ProbeRsTerminalEntry;
    const channelPty: vscode.Pseudoterminal = {
      onDidWrite: channelWriteEmitter.event,
      open: () => {
        this.notifyRttWindowState(entry, true, 'opened');
      },
      close: () => {
        this.notifyRttWindowState(entry, false, 'closed');
      },
      handleInput: this.isUartConsoleChannel(channelNumber, channelName)
        ? data => {
            this.handleTerminalInput(entry, data);
          }
        : undefined,
    };
    const terminal = vscode.window.createTerminal({
      name: channelName,
      pty: channelPty,
    });

    entry = {
      sessionId: session.id,
      session,
      sessionActive: true,
      channelNumber,
      channelName,
      dataFormat,
      terminal,
      channelWriteEmitter,
      inputChannel: this.getInputChannel(session, channelNumber, channelName),
      inputEnabled: false,
      reportedInputFailure: false,
    };
    entry.inputEnabled = entry.inputChannel !== undefined;

    this.rttTerminals.set(key, entry);
    this.terminalKeys.set(terminal, key);

    vscode.debug.activeDebugConsole.appendLine(
      `${ConsoleLogSources.console}: Opened a new RTT Terminal window named: ${channelName}`
    );

    if (this.shouldRevealTerminal(channelNumber, channelName)) {
      terminal.show(false);
    }
  }

  receivedCustomEvent(customEvent: vscode.DebugSessionCustomEvent) {
    switch (customEvent.event) {
      case 'probe-rs-rtt-channel-config':
        this.createRttTerminal(
          customEvent.session,
          +customEvent.body?.channelNumber,
          String(customEvent.body?.dataFormat ?? 'String'),
          String(customEvent.body?.channelName ?? `rtt-${String(customEvent.body?.channelNumber ?? 'unknown')}`)
        );
        break;
      case 'probe-rs-rtt-data':
        const incomingChannelNumber = +customEvent.body?.channelNumber;
        const entry = this.rttTerminals.get(this.getTerminalKey(customEvent.session.id, incomingChannelNumber));
        if (!entry) {
          break;
        }

        switch (entry.dataFormat) {
          case 'BinaryLE': //Don't mess with or filter this data
            entry.channelWriteEmitter.fire(String(customEvent.body?.data ?? ''));
            break;
          default: //Replace newline characters with platform appropriate newline/carriage-return combinations
            entry.channelWriteEmitter.fire(formatText(String(customEvent.body?.data ?? '')));
        }
        break;
      case 'probe-rs-show-message':
        switch (customEvent.body?.severity) {
          case 'information':
            logToConsole(
              `${ConsoleLogSources.info}: ${ConsoleLogSources.console}: ${JSON.stringify(customEvent.body?.message, null, 2)}`,
              true
            );
            vscode.window.showInformationMessage(customEvent.body?.message);
            break;
          case 'warning':
            logToConsole(
              `${ConsoleLogSources.warn}: ${ConsoleLogSources.console}: ${JSON.stringify(customEvent.body?.message, null, 2)}`,
              true
            );
            vscode.window.showWarningMessage(customEvent.body?.message);
            break;
          case 'error':
            logToConsole(
              `${ConsoleLogSources.error}: ${ConsoleLogSources.console}: ${JSON.stringify(customEvent.body?.message, null, 2)}`,
              true
            );
            vscode.window.showErrorMessage(customEvent.body?.message);
            break;
          default:
            logToConsole(`${ConsoleLogSources.error}: ${ConsoleLogSources.console}: Received custom event with unknown message severity:
						${JSON.stringify(customEvent.body?.severity, null, 2)}`);
        }
        break;
      case `exited`:
        this.cleanupSession(customEvent.session.id);
        break;
      default:
        logToConsole(`${ConsoleLogSources.error}: ${ConsoleLogSources.console}: Received unknown custom event:
				${JSON.stringify(customEvent, null, 2)}`);
        break;
    }
  }

  // Note. We do NOT use `DebugAdapterExecutable`, but instead use `DebugAdapterServer` in all cases.
  // - The decision was made during investigation of an [issue](https://github.com/probe-rs/probe-rs/issues/703) ... basically, after the probe-rs API was fixed, the code would work well for TCP connections (`DebugAdapterServer`), but would not work for STDIO connections (`DebugAdapterServer`). After some searches I found other extension developers that also found the TCP based connections to be more stable.
  //  - Since then, we have taken advantage of the access to stderr that `DebugAdapterServer` offers to route `RUST_LOG` output from the debugger to the user's VSCode Debug Console. This is a very useful capability, and cannot easily be implemented in `DebugAdapterExecutable`, because it does not allow access to `stderr` [See ongoing issue in VScode repo](https://github.com/microsoft/vscode/issues/108145).
  async createDebugAdapterDescriptor(
    session: vscode.DebugSession,
    executable: vscode.DebugAdapterExecutable | undefined
  ): Promise<vscode.DebugAdapterDescriptor | null | undefined> {
    if (session.configuration.hasOwnProperty('consoleLogLevel')) {
      consoleLogLevel = session.configuration.consoleLogLevel.toLowerCase();
    }

    // When starting the debugger process, we have to wait for debuggerStatus to be set to `DebuggerStatus.running` before we continue
    enum DebuggerStatus {
      starting,
      running,
      failed,
    }
    var debuggerStatus: DebuggerStatus = DebuggerStatus.starting;

    //Provide default server host and port for "launch" configurations, where this is NOT a mandatory config
    var debugServer = new String('127.0.0.1:50000').split(':', 2);

    // Validate that the `cwd` folder exists.
    if (!existsSync(session.configuration.cwd)) {
      logToConsole(
        `${ConsoleLogSources.error}: ${ConsoleLogSources.console}: The 'cwd' folder does not exist: ${JSON.stringify(
          session.configuration.cwd,
          null,
          2
        )}`
      );
      vscode.window.showErrorMessage(
        vscode.l10n.t("The 'cwd' folder does not exist: {0}", JSON.stringify(session.configuration.cwd, null, 2))
      );
      return undefined;
    }

    if (session.configuration.hasOwnProperty('server')) {
      debugServer = new String(session.configuration.server).split(':', 2);
      logToConsole(
        `${ConsoleLogSources.console}: Debug using existing server" ${JSON.stringify(
          debugServer[0]
        )} on port ${JSON.stringify(debugServer[1])}`
      );
      debuggerStatus = DebuggerStatus.running; // If this is not true as expected, then the user will be notified later.
    } else {
      // Find and use the first available port and spawn a new probe-rs dap-server process
      try {
        var port: number = await getAvailablePort();
        if (port <= 0) {
          throw new Error(vscode.l10n.t('No available port found'));
        }
        debugServer = `127.0.0.1:${port}`.split(':', 2);
      } catch (err: any) {
        logToConsole(`${ConsoleLogSources.error}: ${JSON.stringify(err.message, null, 2)}`);
        vscode.window.showErrorMessage(
          vscode.l10n.t('Searching for an available port failed: {0}', JSON.stringify(err.message, null, 2))
        );
        return undefined;
      }
      var args: string[];
      if (session.configuration.hasOwnProperty('runtimeArgs')) {
        args = session.configuration.runtimeArgs;
      } else {
        args = ['dap-server'];
      }
      args.push('--port');
      args.push(debugServer[1]);
      if (session.configuration.hasOwnProperty('logFile')) {
        args.push('--log-file');
        args.push(session.configuration.logFile);
      } else if (session.configuration.hasOwnProperty('logToFolder')) {
        args.push('--log-to-folder');
      }

      var options = {
        cwd: session.configuration.cwd,
        env: { ...process.env, ...session.configuration.env },
        windowsHide: true,
      };

      // Force the debugger to generate
      options.env.CLICOLOR_FORCE = '1';

      var command = '';
      if (!executable) {
        const runtimeExecutable =
          typeof session.configuration.runtimeExecutable === 'string'
            ? session.configuration.runtimeExecutable.trim()
            : '';
        const runtimeExecutableExplicit = session.configuration[RUNTIME_EXECUTABLE_EXPLICIT_KEY] === true;
        const configuredDebuggerExecutable = getConfiguredDebuggerExecutablePath();

        if (runtimeExecutableExplicit && runtimeExecutable !== '') {
          command = session.configuration.runtimeExecutable;
        } else if (configuredDebuggerExecutable) {
          command = configuredDebuggerExecutable;
        } else {
          const probeRsService = ProbeRsService.getInstance();
          const resolvedProbeRs = await probeRsService.ensureCompatibleProbeRsAvailable();
          if (!resolvedProbeRs) {
            return Promise.reject('Failed to locate a compatible SiFli probe-rs executable.');
          }
          command = resolvedProbeRs;
        }
      } else {
        command = executable.command;
      }

      // The debug adapter process was launched by VSCode, and should terminate itself at the end of every debug session (when receiving `Disconnect` or `Terminate` Request from VSCode). The "false"(default) state of this option implies that the process was launched (and will be managed) by the user.
      args.push('--vscode');

      // Launch the debugger ...
      logToConsole(`${ConsoleLogSources.console}: Launching new server ${JSON.stringify(command)}`);
      logToConsole(
        `${ConsoleLogSources.debug.toLowerCase()}: Launch environment variables: ${JSON.stringify(args)} ${JSON.stringify(options)}`
      );

      try {
        var launchedDebugAdapter = await startDebugServer(command, args, options);
      } catch (error: any) {
        logToConsole(`Failed to launch debug adapter: ${JSON.stringify(error)}`);

        var errorMessage = error;

        // Nicer error message when the executable could not be found.
        if ('code' in error && error.code === 'ENOENT') {
          errorMessage = `Executable '${command}' was not found.`;
        }

        return Promise.reject(`Failed to launch sifli-probe-rs debug adapter: ${errorMessage}`);
      }

      // Capture stderr to ensure OS and RUST_LOG error messages can be brought to the user's attention.
      launchedDebugAdapter.stderr?.on('data', (data: string) => {
        if (
          debuggerStatus === (DebuggerStatus.running as DebuggerStatus) ||
          data.toString().startsWith(ConsoleLogSources.console)
        ) {
          logToConsole(data.toString(), true);
        } else {
          // Any STDERR messages during startup, or on process error, that
          // are not DebuggerStatus.console types, need special consideration,
          // otherwise they will be lost.
          debuggerStatus = DebuggerStatus.failed;
          vscode.window.showErrorMessage(data.toString());
          logToConsole(data.toString(), true);
          launchedDebugAdapter.kill();
        }
      });
      launchedDebugAdapter.on('close', (code: number | null, signal: string | null) => {
        if (debuggerStatus !== (DebuggerStatus.failed as DebuggerStatus)) {
          handleExit(code, signal);
        }
      });
      launchedDebugAdapter.on('error', (err: Error) => {
        if (debuggerStatus !== (DebuggerStatus.failed as DebuggerStatus)) {
          debuggerStatus = DebuggerStatus.failed;
          logToConsole(
            `${JSON.stringify(
              ConsoleLogSources.error
            )}: probe-rs dap-server process encountered an error: ${JSON.stringify(err)} `,
            true
          );
          launchedDebugAdapter.kill();
        }
      });

      // Wait to make sure probe-rs dap-server startup completed, and is ready to accept connections.
      var msRetrySleep = 250;
      var numRetries = 5000 / msRetrySleep;
      while (debuggerStatus !== DebuggerStatus.running && numRetries > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, msRetrySleep));
        if (debuggerStatus === DebuggerStatus.starting) {
          // Test to confirm probe-rs dap-server is ready to accept requests on the specified port.
          try {
            var testPort: number = await getAvailablePort({
              port: +debugServer[1],
            });
            if (testPort === +debugServer[1]) {
              // Port is available, so probe-rs dap-server is not yet initialized.
              numRetries--;
            } else {
              // Port is not available, so probe-rs dap-server is initialized.
              debuggerStatus = DebuggerStatus.running;
            }
          } catch (err: any) {
            logToConsole(`${ConsoleLogSources.error}: ${JSON.stringify(err.message, null, 2)}`);
            vscode.window.showErrorMessage(
              vscode.l10n.t(
                'Testing probe-rs dap-server port availability failed: {0}',
                JSON.stringify(err.message, null, 2)
              )
            );
            return undefined;
          }
        } else if (debuggerStatus === DebuggerStatus.failed) {
          // We would have already reported this, so just get out of the loop.
          break;
        } else {
          debuggerStatus = DebuggerStatus.failed;
          logToConsole(`${ConsoleLogSources.error}: Timeout waiting for probe-rs dap-server to launch`);
          vscode.window.showErrorMessage(vscode.l10n.t('Timeout waiting for probe-rs dap-server to launch'));
          break;
        }
      }

      if (debuggerStatus === (DebuggerStatus.running as DebuggerStatus)) {
        await new Promise<void>(resolve => setTimeout(resolve, 500)); // Wait for a fraction of a second more, to allow TCP/IP port to initialize in probe-rs dap-server
      }
    }

    // make VS Code connect to debug server.
    if (debuggerStatus === (DebuggerStatus.running as DebuggerStatus)) {
      return new vscode.DebugAdapterServer(+debugServer[1], debugServer[0]);
    }
    // If we reach here, VSCode will report the failure to start the debug adapter.
  }

  dispose() {
    for (const key of Array.from(this.rttTerminals.keys())) {
      this.deleteTerminalEntry(key);
    }
  }
}

function startDebugServer(
  command: string,
  args: readonly string[],
  options: childProcess.SpawnOptionsWithoutStdio
): Promise<childProcess.ChildProcessWithoutNullStreams> {
  var launchedDebugAdapter = childProcess.spawn(command, args, options);

  return new Promise<childProcess.ChildProcessWithoutNullStreams>((resolve, reject) => {
    function errorListener(error: any) {
      reject(error);
    }

    launchedDebugAdapter.on('spawn', () => {
      // The error listener here is only used for failed spawn,
      // so has to be removed afterwards.
      launchedDebugAdapter.removeListener('error', errorListener);

      resolve(launchedDebugAdapter);
    });
    launchedDebugAdapter.on('error', errorListener);
  });
}

function getConfiguredDebuggerExecutablePath(): string | undefined {
  const configuration = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  const configuredPath = configuration.get<string>('debuggerExecutable');
  if (!configuredPath || configuredPath.trim() === '') {
    return undefined;
  }
  return configuredPath.trim();
}

class ProbeRsDebugAdapterTrackerFactory implements DebugAdapterTrackerFactory {
  createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
    const tracker = new ProbeRsDebugAdapterTracker(session);
    return tracker;
  }
}

class ProbeRSConfigurationProvider implements DebugConfigurationProvider {
  /**
   * Ensure the provided configuration has the essential defaults applied.
   */
  resolveDebugConfiguration(
    folder: WorkspaceFolder | undefined,
    config: DebugConfiguration,
    token?: CancellationToken
  ): ProviderResult<DebugConfiguration> {
    // TODO: Once we can detect the chip, we can probably provide a working config from defauts.
    // if launch.json is missing or empty
    // if (!config.type && !config.request && !config.name) {
    // const editor = vscode.window.activeTextEditor;
    // if (editor && editor.document.languageId === 'rust') {
    //     config.type = 'sifli-probe-rs';
    //     config.name = 'Launch';
    //     config.request = 'launch';
    //     ...
    // }
    // }

    // Assign the default `cwd` for the project.
    // TODO: We can update probe-rs dap-server to provide defaults that we can fill in here,
    // and ensure the extension defaults are consistent with those of the server.
    if (!config.cwd) {
      config.cwd = '${workspaceFolder}';
    }

    config[RUNTIME_EXECUTABLE_EXPLICIT_KEY] = Object.prototype.hasOwnProperty.call(config, 'runtimeExecutable');

    return config;
  }
}

class ProbeRsDebugAdapterTracker implements DebugAdapterTracker {
  constructor(private readonly session: vscode.DebugSession) {}

  onWillStopSession(): void {
    logToConsole(`${ConsoleLogSources.console}: Closing sifli-probe-rs debug session`);
  }

  // Code to help debugging the connection between the extension and the sifli-probe-rs debug adapter.
  // onWillReceiveMessage(message: any) {
  //     if (consoleLogLevel === toCamelCase(ConsoleLogSources.debug)) {
  //         logToConsole(`${ConsoleLogSources.debug}: Received message from debug adapter:
  // 		${JSON.stringify(message, null, 2)}`);
  //     }
  // }
  // onDidSendMessage(message: any) {
  //     if (consoleLogLevel === toCamelCase(ConsoleLogSources.debug)) {
  //         logToConsole(`${ConsoleLogSources.debug}: Sending message to debug adapter:
  // 		${JSON.stringify(message, null, 2)}`);
  //     }
  // }

  onDidSendMessage(message: unknown): void {
    const debugMessage = message as { type?: string } | undefined;
    if (debugMessage?.type !== 'event') {
      return;
    }

    for (const listener of probeRsDidSendMessageListeners) {
      try {
        listener(this.session, message);
      } catch (error) {
        logToConsole(
          `${ConsoleLogSources.error}: Failed to notify probe-rs debug listeners: ${JSON.stringify(error)}`,
          true
        );
      }
    }
  }

  onError(error: Error) {
    if (consoleLogLevel === toCamelCase(ConsoleLogSources.debug)) {
      logToConsole(`${ConsoleLogSources.error}: Error in communication with debug adapter:
			${JSON.stringify(error, null, 2)}`);
    }
  }

  onExit(code: number, signal: string) {
    handleExit(code, signal);
  }
}
