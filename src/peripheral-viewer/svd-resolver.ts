import * as path from 'path';
import * as vscode from 'vscode';
import { SETTINGS_NAMESPACE, SETTINGS_SVD_FILE } from './manifest';

export interface ResolvedSvdFile {
  path: string;
  source: 'launch' | 'workspace';
}

export class SvdResolverError extends Error {}

export class SvdResolver {
  public resolve(session: vscode.DebugSession): ResolvedSvdFile | undefined {
    const launchSvdFile = this.resolveLaunchOverride(session);
    if (launchSvdFile) {
      return {
        path: launchSvdFile,
        source: 'launch',
      };
    }

    const workspaceSetting = this.getWorkspaceSvdSetting(session);
    if (!workspaceSetting) {
      return undefined;
    }

    return {
      path: workspaceSetting,
      source: 'workspace',
    };
  }

  private resolveLaunchOverride(session: vscode.DebugSession): string | undefined {
    const coreConfigs = Array.isArray(session.configuration.coreConfigs) ? session.configuration.coreConfigs : [];
    const configured = coreConfigs
      .map(coreConfig =>
        typeof coreConfig?.peripheralViewerSvdFile === 'string' ? coreConfig.peripheralViewerSvdFile.trim() : ''
      )
      .filter((svdFile): svdFile is string => svdFile.length > 0);

    if (configured.length > 1) {
      throw new SvdResolverError(
        vscode.l10n.t(
          'Peripheral Viewer does not support multiple core SVD files in one debug configuration yet. Keep only one "peripheralViewerSvdFile".'
        )
      );
    }

    const launchSvdFile = configured[0];
    if (!launchSvdFile) {
      return undefined;
    }

    return this.resolvePath(launchSvdFile, this.getDebugCwd(session));
  }

  private getWorkspaceSvdSetting(session: vscode.DebugSession): string | undefined {
    const scope = session.workspaceFolder?.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
    const config = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE, scope);
    const configured = config.get<string>(SETTINGS_SVD_FILE)?.trim();
    if (!configured) {
      return undefined;
    }

    const basePath = scope?.fsPath ?? this.getDebugCwd(session);
    return this.resolvePath(configured, basePath);
  }

  private getDebugCwd(session: vscode.DebugSession): string | undefined {
    const cwd = typeof session.configuration.cwd === 'string' ? session.configuration.cwd.trim() : '';
    if (cwd) {
      return cwd;
    }

    return session.workspaceFolder?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private resolvePath(configuredPath: string, basePath?: string): string {
    if (path.isAbsolute(configuredPath)) {
      return path.normalize(configuredPath);
    }

    if (!basePath) {
      return path.normalize(configuredPath);
    }

    return path.normalize(path.resolve(basePath, configuredPath));
  }
}
