import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SdkVersion } from '../types';
import { ConfigService } from './configService';
import { GitService } from './gitService';
import { LogService } from './logService';
import { SdkService } from './sdkService';
import { StatusBarProvider } from '../providers/statusBarProvider';
import { getSiFliProjectInfo, isSiFliProjectPath } from '../utils/projectUtils';

export interface ProjectTemplate {
  sdkPath: string;
  sdkVersion: string;
  templateRootPath: string;
  relativeExamplePath: string;
  displayName: string;
}

export type CreateProjectFromTemplateOptions = {
  sdkPath?: string;
  sdkVersion?: string;
  templatePath?: string;
  relativeExamplePath?: string;
  targetPath: string;
  initializeGit?: boolean;
};

export type CreateProjectFromTemplateResult = {
  success: boolean;
  sdkPath?: string;
  sdkVersion?: string;
  templatePath?: string;
  targetPath?: string;
  gitInitialized?: boolean;
  message?: string;
};

const EXAMPLE_SUBFOLDER = 'example';
const GITIGNORE_LINES = [
  '*.bak',
  '*.un~',
  '*.*~',
  '*.scvd',
  '*.old',
  '*.uvoptx',
  '/**/build_*/',
  '/**/build/',
  '/**/__pycache__/',
  '/**/*.pyc',
  '.sconsign.dblite',
  '.DS_Store',
  '.idea',
  'Kconfig.tmp',
];

const SKIP_DIRECTORIES = new Set(['.git', '.svn', '.idea', '__pycache__', 'build', 'node_modules']);

export class ProjectCreationService {
  private static instance: ProjectCreationService;

  private configService: ConfigService;
  private sdkService: SdkService;
  private gitService: GitService;
  private logService: LogService;
  private statusBarProvider: StatusBarProvider;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.sdkService = SdkService.getInstance();
    this.gitService = GitService.getInstance();
    this.logService = LogService.getInstance();
    this.statusBarProvider = StatusBarProvider.getInstance();
  }

  public static getInstance(): ProjectCreationService {
    if (!ProjectCreationService.instance) {
      ProjectCreationService.instance = new ProjectCreationService();
    }
    return ProjectCreationService.instance;
  }

  public async createNewProjectFromSdkExamples(): Promise<void> {
    try {
      const sdk = await this.selectSdk();
      if (!sdk) {
        return;
      }

      const template = await this.selectTemplate(sdk);
      if (!template) {
        return;
      }

      const targetPath = await this.selectTargetPath(template);
      if (!targetPath) {
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: vscode.l10n.t('Creating project...'),
          cancellable: false,
        },
        async progress => {
          progress.report({ message: vscode.l10n.t('Copying template files...') });
          this.copyTemplate(template.templateRootPath, targetPath);
        }
      );

      const initializeGit = await this.confirmInitializeGit();

      if (initializeGit) {
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: vscode.l10n.t('Initializing Git repository...'),
              cancellable: false,
            },
            async progress => {
              progress.report({ message: vscode.l10n.t('Preparing .gitignore...') });
              this.ensureGitignore(targetPath);

              progress.report({ message: vscode.l10n.t('Running git init...') });
              await this.initializeGitRepository(targetPath);
            }
          );

          await this.showOpenProjectPrompt(
            targetPath,
            vscode.l10n.t('SiFli project created at {0}', targetPath),
            'information'
          );
          return;
        } catch (error) {
          this.logService.error('Git initialization failed after project creation:', error);
          await this.showOpenProjectPrompt(
            targetPath,
            vscode.l10n.t(
              'SiFli project created at {0}, but Git initialization failed: {1}',
              targetPath,
              this.getErrorMessage(error)
            ),
            'warning'
          );
          return;
        }
      }

      await this.showOpenProjectPrompt(
        targetPath,
        vscode.l10n.t('SiFli project created at {0}', targetPath),
        'information'
      );
    } catch (error) {
      this.logService.error('Failed to create SiFli project:', error);
      vscode.window.showErrorMessage(vscode.l10n.t('Failed to create SiFli project: {0}', this.getErrorMessage(error)));
    }
  }

  public async listProjectTemplates(options?: { sdkPath?: string; sdkVersion?: string }): Promise<ProjectTemplate[]> {
    const sdk = await this.resolveSdkForAutomation(options);
    if (!sdk) {
      return [];
    }

    const cancellationSource = new vscode.CancellationTokenSource();
    const templates = await this.discoverTemplates(sdk, cancellationSource.token);
    cancellationSource.dispose();
    return templates ?? [];
  }

  public async createProjectFromTemplate(
    options: CreateProjectFromTemplateOptions
  ): Promise<CreateProjectFromTemplateResult> {
    try {
      const sdk = await this.resolveSdkForAutomation(options);
      if (!sdk) {
        return {
          success: false,
          message: vscode.l10n.t('No valid SiFli SDKs found. Open SDK Manager first.'),
        };
      }

      const template = await this.resolveTemplateForAutomation(sdk, options);
      if (!template) {
        return {
          success: false,
          message: vscode.l10n.t('Project template not found.'),
        };
      }

      const pathValidationError = this.validateTargetPath(template.templateRootPath, options.targetPath);
      if (pathValidationError) {
        return {
          success: false,
          message: pathValidationError,
        };
      }

      if (fs.existsSync(options.targetPath)) {
        return {
          success: false,
          message: vscode.l10n.t('Target folder already exists.'),
        };
      }

      this.copyTemplate(template.templateRootPath, options.targetPath);

      let gitInitialized = false;
      if (options.initializeGit) {
        this.ensureGitignore(options.targetPath);
        await this.initializeGitRepository(options.targetPath);
        gitInitialized = true;
      }

      return {
        success: true,
        sdkPath: template.sdkPath,
        sdkVersion: template.sdkVersion,
        templatePath: template.templateRootPath,
        targetPath: options.targetPath,
        gitInitialized,
        message: vscode.l10n.t('SiFli project created at {0}', options.targetPath),
      };
    } catch (error) {
      return {
        success: false,
        targetPath: options.targetPath,
        message: this.getErrorMessage(error),
      };
    }
  }

  private async selectSdk(): Promise<SdkVersion | undefined> {
    const sdkVersions = await this.sdkService.discoverSiFliSdks();
    this.configService.detectedSdkVersions = sdkVersions;

    const validSdks = sdkVersions.filter(sdk => sdk.valid);
    if (validSdks.length === 0) {
      const openSdkManager = vscode.l10n.t('Open SDK Manager');
      const choice = await vscode.window.showWarningMessage(
        vscode.l10n.t('No valid SiFli SDKs found. Open SDK Manager first.'),
        openSdkManager,
        vscode.l10n.t('Cancel')
      );

      if (choice === openSdkManager) {
        await vscode.commands.executeCommand('extension.manageSiFliSdk');
      }

      return undefined;
    }

    const currentSdkPath = this.configService.getCurrentSdkPath();
    const currentSdk = validSdks.find(sdk => sdk.path === currentSdkPath || sdk.current);
    if (currentSdk) {
      return currentSdk;
    }

    if (validSdks.length === 1) {
      const [sdk] = validSdks;
      await this.syncSelectedSdk(sdk);
      return sdk;
    }

    const selectedItem = await vscode.window.showQuickPick(
      validSdks.map(sdk => ({
        label: sdk.version,
        description: sdk.current ? vscode.l10n.t('(current)') : '',
        detail: sdk.path,
        sdk,
      })),
      {
        placeHolder: vscode.l10n.t('Select the SiFli SDK used to create the project'),
      }
    );

    if (!selectedItem) {
      return undefined;
    }

    await this.syncSelectedSdk(selectedItem.sdk);

    return selectedItem.sdk;
  }

  private async resolveSdkForAutomation(options?: {
    sdkPath?: string;
    sdkVersion?: string;
  }): Promise<SdkVersion | undefined> {
    const sdkVersions = await this.sdkService.discoverSiFliSdks();
    this.configService.detectedSdkVersions = sdkVersions;

    if (options?.sdkPath) {
      return sdkVersions.find(sdk => sdk.path === options.sdkPath && sdk.valid);
    }

    if (options?.sdkVersion) {
      return sdkVersions.find(sdk => sdk.version === options.sdkVersion && sdk.valid);
    }

    const currentSdkPath = this.configService.getCurrentSdkPath();
    const currentSdk = sdkVersions.find(sdk => (sdk.path === currentSdkPath || sdk.current) && sdk.valid);
    if (currentSdk) {
      return currentSdk;
    }

    const validSdks = sdkVersions.filter(sdk => sdk.valid);
    return validSdks.length === 1 ? validSdks[0] : undefined;
  }

  private async resolveTemplateForAutomation(
    sdk: SdkVersion,
    options: CreateProjectFromTemplateOptions
  ): Promise<ProjectTemplate | undefined> {
    if (options.templatePath) {
      const relativeExamplePath = path.relative(path.join(sdk.path, EXAMPLE_SUBFOLDER), options.templatePath);
      return {
        sdkPath: sdk.path,
        sdkVersion: sdk.version,
        templateRootPath: options.templatePath,
        relativeExamplePath,
        displayName: relativeExamplePath.split(path.sep).join('/'),
      };
    }

    const templates = await this.listProjectTemplates({ sdkPath: sdk.path });
    if (options.relativeExamplePath) {
      return templates.find(template => template.relativeExamplePath === options.relativeExamplePath);
    }

    return undefined;
  }

  private async syncSelectedSdk(sdk: SdkVersion): Promise<void> {
    if (this.configService.getCurrentSdkPath() !== sdk.path) {
      await this.configService.setCurrentSdkPath(sdk.path);
      this.statusBarProvider.updateStatusBarItems();
    }
  }

  private async selectTemplate(sdk: SdkVersion): Promise<ProjectTemplate | undefined> {
    const templates = await vscode.window.withProgress<ProjectTemplate[] | undefined>(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('Scanning SDK examples...'),
        cancellable: true,
      },
      async (progress, token) => {
        progress.report({
          message: vscode.l10n.t('Scanning {0}/example for project templates...', sdk.version),
        });

        return this.discoverTemplates(sdk, token);
      }
    );

    if (!templates) {
      return undefined;
    }

    if (templates.length === 0) {
      vscode.window.showWarningMessage(
        vscode.l10n.t('No supported SiFli project templates were found in {0}', sdk.path)
      );
      return undefined;
    }

    const selectedItem = await vscode.window.showQuickPick(
      templates.map(template => ({
        label: template.displayName,
        description: sdk.version,
        detail: template.templateRootPath,
        template,
      })),
      {
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: vscode.l10n.t('Select a SiFli project template'),
      }
    );

    return selectedItem?.template;
  }

  private async selectTargetPath(template: ProjectTemplate): Promise<string | undefined> {
    const parentSelection = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: vscode.l10n.t('Select Parent Folder'),
      title: vscode.l10n.t('Select the parent folder for the new SiFli project'),
    });

    if (!parentSelection || parentSelection.length === 0) {
      return undefined;
    }

    const parentPath = parentSelection[0].fsPath;
    const defaultName = path.basename(template.templateRootPath);
    const projectName = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Enter the new project folder name'),
      placeHolder: defaultName,
      value: defaultName,
      validateInput: value => this.validateProjectName(parentPath, value, template.templateRootPath),
    });

    if (projectName === undefined) {
      return undefined;
    }

    return path.join(parentPath, projectName.trim());
  }

  private async confirmInitializeGit(): Promise<boolean> {
    const initializeGit = vscode.l10n.t('Initialize Git');
    const choice = await vscode.window.showInformationMessage(
      vscode.l10n.t('Initialize a Git repository and create a default .gitignore file?'),
      initializeGit,
      vscode.l10n.t('Skip')
    );

    return choice === initializeGit;
  }

  private async showOpenProjectPrompt(
    targetPath: string,
    message: string,
    severity: 'information' | 'warning'
  ): Promise<void> {
    const openInNewWindow = vscode.l10n.t('Open in New Window');
    const openInCurrentWindow = vscode.l10n.t('Open in Current Window');
    const later = vscode.l10n.t('Later');

    const showMessage =
      severity === 'warning' ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;

    const choice = await showMessage(message, openInNewWindow, openInCurrentWindow, later);

    if (choice === openInNewWindow) {
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), true);
    } else if (choice === openInCurrentWindow) {
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
    }
  }

  private async discoverTemplates(
    sdk: SdkVersion,
    token: vscode.CancellationToken
  ): Promise<ProjectTemplate[] | undefined> {
    const exampleRoot = path.join(sdk.path, EXAMPLE_SUBFOLDER);
    if (!fs.existsSync(exampleRoot) || !fs.statSync(exampleRoot).isDirectory()) {
      throw new Error(vscode.l10n.t('SDK example directory does not exist: {0}', exampleRoot));
    }

    const templates: ProjectTemplate[] = [];

    const walk = (directory: string): boolean => {
      if (token.isCancellationRequested) {
        return false;
      }

      if (isSiFliProjectPath(directory)) {
        const relativeExamplePath = path.relative(exampleRoot, directory);
        templates.push({
          sdkPath: sdk.path,
          sdkVersion: sdk.version,
          templateRootPath: directory,
          relativeExamplePath,
          displayName: relativeExamplePath.split(path.sep).join('/'),
        });
        return true;
      }

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch (error) {
        this.logService.warn(`Failed to read SDK example directory: ${directory}`, error);
        return true;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        if (this.shouldSkipScanDirectory(entry.name)) {
          continue;
        }

        const shouldContinue = walk(path.join(directory, entry.name));
        if (!shouldContinue) {
          return false;
        }
      }

      return true;
    };

    const completed = walk(exampleRoot);
    if (!completed) {
      return undefined;
    }

    templates.sort((left, right) => left.displayName.localeCompare(right.displayName));
    this.logService.info(`Discovered ${templates.length} project template(s) in SDK ${sdk.version}`);

    return templates;
  }

  private shouldSkipScanDirectory(name: string): boolean {
    return SKIP_DIRECTORIES.has(name) || name.startsWith('build_') || name.startsWith('.');
  }

  private validateProjectName(parentPath: string, value: string, templateRootPath: string): string | null {
    const trimmed = value.trim();

    if (!trimmed) {
      return vscode.l10n.t('Project name is required.');
    }

    if (trimmed === '.' || trimmed === '..') {
      return vscode.l10n.t('Project name cannot be "." or "..".');
    }

    if (trimmed.includes('/') || trimmed.includes('\\')) {
      return vscode.l10n.t('Project name cannot contain path separators.');
    }

    const targetPath = path.join(parentPath, trimmed);
    const pathValidationError = this.validateTargetPath(templateRootPath, targetPath);
    if (pathValidationError) {
      return pathValidationError;
    }

    if (fs.existsSync(targetPath)) {
      return vscode.l10n.t('Target folder already exists.');
    }

    return null;
  }

  private copyTemplate(sourceRoot: string, targetRoot: string): void {
    const pathValidationError = this.validateTargetPath(sourceRoot, targetRoot);
    if (pathValidationError) {
      throw new Error(pathValidationError);
    }

    const parentRoot = path.dirname(targetRoot);
    const stagingContainer = fs.mkdtempSync(path.join(parentRoot, '.sifli-create-'));
    const stagingTarget = path.join(stagingContainer, path.basename(targetRoot));

    try {
      fs.cpSync(sourceRoot, stagingTarget, {
        recursive: true,
        errorOnExist: true,
        force: false,
        filter: sourcePath => this.shouldCopyPath(sourceRoot, sourcePath),
      });

      fs.renameSync(stagingTarget, targetRoot);
      this.logService.info(`Project template copied from ${sourceRoot} to ${targetRoot}`);
    } catch (error) {
      if (this.isTargetAlreadyExistsError(error)) {
        throw new Error(vscode.l10n.t('Target folder already exists.'));
      }
      throw error;
    } finally {
      this.cleanupStagingDirectory(stagingContainer);
    }
  }

  private shouldCopyPath(sourceRoot: string, sourcePath: string): boolean {
    const relativePath = path.relative(sourceRoot, sourcePath);
    if (!relativePath) {
      return true;
    }

    const pathSegments = relativePath.split(path.sep);
    const entryName = path.basename(sourcePath);
    const isDirectory = fs.statSync(sourcePath).isDirectory();
    const directorySegments = isDirectory ? pathSegments : pathSegments.slice(0, -1);

    if (directorySegments.some(segment => SKIP_DIRECTORIES.has(segment) || segment.startsWith('build_'))) {
      return false;
    }

    if (isDirectory) {
      return true;
    }

    return !this.shouldSkipGeneratedFile(entryName);
  }

  private shouldSkipGeneratedFile(fileName: string): boolean {
    return (
      fileName.endsWith('.bak') ||
      fileName.endsWith('.un~') ||
      fileName.endsWith('~') ||
      fileName.endsWith('.scvd') ||
      fileName.endsWith('.old') ||
      fileName.endsWith('.uvoptx') ||
      fileName.endsWith('.pyc') ||
      fileName === '.sconsign.dblite' ||
      fileName === '.DS_Store'
    );
  }

  private ensureGitignore(targetRoot: string): void {
    const gitignorePath = path.join(targetRoot, '.gitignore');
    const existingLines = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8').split(/\r?\n/) : [];

    const normalizedExistingLines = existingLines.map(line => line.trimEnd());
    const lineSet = new Set(normalizedExistingLines);
    const missingLines = GITIGNORE_LINES.filter(line => !lineSet.has(line));

    if (missingLines.length === 0 && fs.existsSync(gitignorePath)) {
      return;
    }

    const nextLines = normalizedExistingLines.filter((line, index, lines) => {
      return index < lines.length - 1 || line.length > 0;
    });

    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
      nextLines.push('');
    }

    nextLines.push(...missingLines);
    fs.writeFileSync(gitignorePath, `${nextLines.join('\n').replace(/\n+$/, '\n')}\n`, 'utf8');
  }

  private async initializeGitRepository(targetRoot: string): Promise<void> {
    if (!(await this.gitService.isGitInstalled())) {
      throw new Error(vscode.l10n.t('Git is not installed or not available in PATH.'));
    }

    const projectInfo = getSiFliProjectInfo(targetRoot);
    if (!projectInfo) {
      throw new Error(vscode.l10n.t('The copied project is not recognized as a supported SiFli project.'));
    }

    await this.gitService.executeGitCommand('git', ['init'], targetRoot);
  }

  private cleanupStagingDirectory(stagingContainer: string): void {
    if (!fs.existsSync(stagingContainer)) {
      return;
    }

    try {
      fs.rmSync(stagingContainer, { recursive: true, force: true });
    } catch (error) {
      this.logService.warn(`Failed to clean up staging directory: ${stagingContainer}`, error);
    }
  }

  private isTargetAlreadyExistsError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const errorCode = (error as NodeJS.ErrnoException).code;
    return errorCode === 'EEXIST' || errorCode === 'ENOTEMPTY';
  }

  private validateTargetPath(templateRootPath: string, targetPath: string): string | null {
    try {
      const normalizedTemplatePath = this.getComparablePath(templateRootPath);
      const normalizedTargetPath = this.getComparablePath(targetPath);

      if (this.isSameOrSubPath(normalizedTargetPath, normalizedTemplatePath)) {
        return vscode.l10n.t('Target folder cannot be the selected template directory or one of its subdirectories.');
      }

      if (this.isSameOrSubPath(normalizedTemplatePath, normalizedTargetPath)) {
        return vscode.l10n.t('Target folder cannot contain the selected template directory.');
      }
    } catch (error) {
      this.logService.warn(`Failed to validate project target path: ${targetPath}`, error);
    }

    return null;
  }

  private getComparablePath(targetPath: string): string {
    const resolvedPath = path.resolve(targetPath);
    const existingAncestorPath = this.findExistingAncestorPath(resolvedPath);
    const realAncestorPath = fs.realpathSync.native(existingAncestorPath);
    const relativeSuffix = path.relative(existingAncestorPath, resolvedPath);
    const comparablePath = relativeSuffix ? path.join(realAncestorPath, relativeSuffix) : realAncestorPath;

    return this.normalizePathForComparison(comparablePath);
  }

  private findExistingAncestorPath(targetPath: string): string {
    let currentPath = targetPath;

    while (!fs.existsSync(currentPath)) {
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        throw new Error(`No existing ancestor found for path: ${targetPath}`);
      }
      currentPath = parentPath;
    }

    return currentPath;
  }

  private isSameOrSubPath(targetPath: string, basePath: string): boolean {
    const relativePath = path.relative(basePath, targetPath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
  }

  private normalizePathForComparison(targetPath: string): string {
    const normalizedPath = path.normalize(targetPath);
    return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
