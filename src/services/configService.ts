import * as vscode from 'vscode';
import { SiFliConfig, SdkVersion } from '../types';

export class ConfigService {
  private static instance: ConfigService;
  private _config: SiFliConfig;
  private _detectedSdkVersions: SdkVersion[] = [];

  private constructor() {
    this._config = this.loadConfiguration();
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  public get config(): SiFliConfig {
    return this._config;
  }

  public get detectedSdkVersions(): SdkVersion[] {
    return this._detectedSdkVersions;
  }

  public set detectedSdkVersions(versions: SdkVersion[]) {
    this._detectedSdkVersions = versions;
  }

  private loadConfiguration(): SiFliConfig {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    
    return {
      powershellPath: config.get<string>('powershellPath'),
      sifliSdkExportScriptPath: config.get<string>('sifliSdkExportScriptPath'),
      installedSdkPaths: config.get<string[]>('installedSdkPaths') || [],
      defaultChipModule: config.get<string>('defaultChipModule') || '',
      numThreads: config.get<number>('numThreads') || 8,
      customBoardSearchPath: config.get<string>('customBoardSearchPath')
    };
  }

  public async updateConfiguration(): Promise<void> {
    this._config = this.loadConfiguration();
  }

  public async updateConfigValue<K extends keyof SiFliConfig>(
    key: K, 
    value: SiFliConfig[K], 
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('sifli-sdk-codekit');
    await config.update(key, value, target);
    this._config[key] = value;
  }

  public getCurrentSdk(): SdkVersion | undefined {
    return this._detectedSdkVersions.find(sdk => sdk.current);
  }

  public getSelectedBoardName(): string {
    return this._config.defaultChipModule || 'N/A';
  }

  public getNumThreads(): number {
    return this._config.numThreads;
  }
}
