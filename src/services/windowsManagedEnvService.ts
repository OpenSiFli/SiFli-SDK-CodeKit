import * as path from 'path';
import { PythonService } from './pythonService';
import { MinGitService } from './minGitService';
import { ProbeRsService } from './probeRsService';
import { UvService } from './uvService';
import {
  buildWindowsPowerShellPathCommand,
  getWindowsEnvPath,
  prependWindowsPathEntries,
  setWindowsEnvPath,
} from '../utils/windowsPathUtils';

export class WindowsManagedEnvService {
  private static instance: WindowsManagedEnvService;

  public static getInstance(): WindowsManagedEnvService {
    if (!WindowsManagedEnvService.instance) {
      WindowsManagedEnvService.instance = new WindowsManagedEnvService();
    }
    return WindowsManagedEnvService.instance;
  }

  public buildTerminalPathEntries(): string[] {
    if (process.platform !== 'win32') {
      return [];
    }

    const entries: string[] = [];
    const gitCmdDir = MinGitService.getInstance().getGitCmdDir();
    const probeRsDir = ProbeRsService.getInstance().getManagedExecutableDir();
    const uvDir = UvService.getInstance().getManagedExecutableDir();
    const pythonDir = PythonService.getInstance().getPythonDir();

    if (gitCmdDir) {
      entries.push(gitCmdDir);
    }
    if (probeRsDir) {
      entries.push(probeRsDir);
    }
    if (uvDir) {
      entries.push(uvDir);
    }
    if (pythonDir) {
      entries.push(pythonDir, path.join(pythonDir, 'Scripts'));
    }

    return entries;
  }

  public buildInstallScriptPathEntries(): string[] {
    if (process.platform !== 'win32') {
      return [];
    }

    const entries: string[] = [];
    const uvDir = UvService.getInstance().getManagedExecutableDir();
    const pythonDir = PythonService.getInstance().getPythonDir();

    if (uvDir) {
      entries.push(uvDir);
    }
    if (pythonDir) {
      entries.push(pythonDir, path.join(pythonDir, 'Scripts'));
    }

    return entries;
  }

  public applyPathEntries(env: NodeJS.ProcessEnv, entries: Array<string | undefined | null>): string {
    const nextPath = prependWindowsPathEntries(getWindowsEnvPath(env), entries);
    setWindowsEnvPath(env, nextPath);
    return nextPath;
  }

  public applyInstallScriptEnvironment(env: NodeJS.ProcessEnv): string[] {
    const entries = this.buildInstallScriptPathEntries();
    this.applyPathEntries(env, entries);
    return entries;
  }

  public buildTerminalPathCommand(entries?: string[]): string | undefined {
    return buildWindowsPowerShellPathCommand(entries ?? this.buildTerminalPathEntries());
  }
}
