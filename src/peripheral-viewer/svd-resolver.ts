import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { SETTINGS_NAMESPACE, SETTINGS_SVD_FILE } from './manifest';

export interface ResolvedSvdFile {
  path: string;
  source: 'launch' | 'workspace' | 'default';
}

export class SvdResolverError extends Error {}

export class SvdResolver {
  private readonly configService = ConfigService.getInstance();

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
      const defaultSvd = this.getDefaultSvdFromBoard();
      if (!defaultSvd) {
        return undefined;
      }

      return {
        path: defaultSvd,
        source: 'default',
      };
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

  private getDefaultSvdFromBoard(): string | undefined {
    const sdkRoot = this.configService.getCurrentSdkPath().trim();
    const boardName = this.configService.getSelectedBoardName().trim();

    if (!sdkRoot || !boardName || boardName === 'N/A') {
      return undefined;
    }

    // Important: keep this regex intentionally narrow.
    // We only derive a default SVD when the selected board name explicitly contains a known chip token
    // such as SF32LB52 or SF32LB52X. If there is no match, do not guess a fallback SVD.
    const chipMatch = boardName.match(/\b(SF32LB(?:52|56|58))(?:X)?\b/i);
    if (!chipMatch) {
      return undefined;
    }

    // SDK convention:
    //   $SDK_ROOT/tools/svd_external/SF32LB52X/SF32LB52x.svd
    const chipModel = chipMatch[1].toUpperCase();
    const candidate = path.join(sdkRoot, 'tools', 'svd_external', `${chipModel}X`, `${chipModel}x.svd`);
    if (!fs.existsSync(candidate)) {
      return undefined;
    }

    return candidate;
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
