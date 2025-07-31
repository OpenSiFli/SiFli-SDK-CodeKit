import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Board, BoardDiscoveryResult, SftoolParam } from '../types';
import { CUSTOMER_BOARDS_SUBFOLDER, HCPU_SUBFOLDER, PTAB_JSON_FILE, SFTOOL_PARAM_JSON_FILE } from '../constants';
import { ConfigService } from './configService';
import { LogService } from './logService';

export class BoardService {
  private static instance: BoardService;
  private configService: ConfigService;
  private logService: LogService;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.logService = LogService.getInstance();
  }

  public static getInstance(): BoardService {
    if (!BoardService.instance) {
      BoardService.instance = new BoardService();
    }
    return BoardService.instance;
  }

  /**
   * 发现所有可用的板子
   */
  public async discoverBoards(): Promise<Board[]> {
    const boardMap = new Map<string, Board>();
    const currentSdk = this.configService.getCurrentSdk();
    
    if (currentSdk?.path) {
      // 扫描 SDK 中的板子
      const sdkBoardsPath = path.join(currentSdk.path, CUSTOMER_BOARDS_SUBFOLDER);
      await this.scanDirectoryForBoards(sdkBoardsPath, boardMap, 'sdk');
    }

    // 扫描自定义板子路径
    const customBoardSearchPath = this.configService.config.customBoardSearchPath;
    if (customBoardSearchPath) {
      await this.scanDirectoryForBoards(customBoardSearchPath, boardMap, 'custom');
    }

    // 扫描项目本地板子目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const projectLocalBoardsPath = path.join(workspaceRoot, 'boards');
      await this.scanDirectoryForBoards(projectLocalBoardsPath, boardMap, 'project_local');
    }

    return Array.from(boardMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 扫描目录中的板子
   */
  private async scanDirectoryForBoards(
    directoryPath: string, 
    boardMap: Map<string, Board>, 
    sourceType: Board['type']
  ): Promise<void> {
    try {
      if (!fs.existsSync(directoryPath)) {
        return;
      }

      const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const boardPath = path.join(directoryPath, entry.name);
          const hcpuPath = path.join(boardPath, HCPU_SUBFOLDER);
          const ptabJsonPath = path.join(boardPath, PTAB_JSON_FILE);

          // 检查是否存在 hcpu 目录和 ptab.json 文件
          if (fs.existsSync(hcpuPath) && fs.existsSync(ptabJsonPath)) {
            const boardName = entry.name;
            
            // 避免重复添加（优先级：project_local > custom > sdk）
            if (!boardMap.has(boardName) || this.getBoardTypePriority(sourceType) > this.getBoardTypePriority(boardMap.get(boardName)!.type)) {
              boardMap.set(boardName, {
                name: boardName,
                path: boardPath,
                type: sourceType
              });
            }
          }
        }
      }
          } catch (error) {
        this.logService.error(`Error scanning directory ${directoryPath}:`, error);
      }
  }

  private getBoardTypePriority(type: Board['type']): number {
    switch (type) {
      case 'project_local': return 3;
      case 'custom': return 2;
      case 'sdk': return 1;
      default: return 0;
    }
  }

  public getProjectFolderPath(): string {
    return 'project';
  }

  /**
   * 获取构建目标文件夹
   */
  public getBuildTargetFolder(boardName: string): string {
    return path.join(this.getProjectFolderPath(), `build_${boardName}_hcpu`);
  }

  /**
   * 读取 sftool 参数文件
   */
  public async readSftoolParamJson(boardName: string): Promise<SftoolParam | null> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const buildFolder = this.getBuildTargetFolder(boardName);
      const sftoolParamPath = path.join(workspaceRoot, buildFolder, SFTOOL_PARAM_JSON_FILE);

      if (!fs.existsSync(sftoolParamPath)) {
        this.logService.warn(`sftool_param.json not found at: ${sftoolParamPath}`);
        return null;
      }

      const content = fs.readFileSync(sftoolParamPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      this.logService.error(`Error reading sftool_param.json for board ${boardName}:`, error);
      return null;
    }
  }

  /**
   * 生成编译命令
   */
  public async getCompileCommand(boardName: string, threads: number): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders && workspaceFolders.length > 0 
      ? workspaceFolders[0].uri.fsPath 
      : '';
    const projectPath = path.join(workspaceRoot, 'project');

    let boardSearchArg = '';
    const availableBoards = await this.discoverBoards();
    const currentBoard = availableBoards.find(b => b.name === boardName);

    if (currentBoard) {
      if (currentBoard.type === 'sdk') {
        boardSearchArg = '';
      } else if (currentBoard.type === 'project_local') {
        const projectLocalBoardsDir = path.dirname(currentBoard.path);
        const relativeToProject = path.relative(projectPath, projectLocalBoardsDir);
        boardSearchArg = ` --board_search_path="${relativeToProject}"`;
      } else if (currentBoard.type === 'custom') {
        const relativeToProject = path.relative(projectPath, currentBoard.path);
        boardSearchArg = ` --board_search_path="${path.dirname(relativeToProject)}"`;
      }
    }

    return `scons --board=${boardName}${boardSearchArg} -j${threads}`;
  }

  /**
   * 生成 Menuconfig 命令
   */
  public async getMenuconfigCommand(boardName: string): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders && workspaceFolders.length > 0 
      ? workspaceFolders[0].uri.fsPath 
      : '';
    const projectPath = path.join(workspaceRoot, 'project');

    let boardSearchArg = '';
    const availableBoards = await this.discoverBoards();
    const currentBoard = availableBoards.find(b => b.name === boardName);

    if (currentBoard && currentBoard.type !== 'sdk') {
      if (currentBoard.type === 'project_local') {
        const projectLocalBoardsDir = path.dirname(currentBoard.path);
        const relativeToProject = path.relative(projectPath, projectLocalBoardsDir);
        boardSearchArg = ` --board_search_path="${relativeToProject}"`;
      } else if (currentBoard.type === 'custom') {
        const relativeToProject = path.relative(projectPath, currentBoard.path);
        boardSearchArg = ` --board_search_path="${path.dirname(relativeToProject)}"`;
      }
    }

    return `scons --board=${boardName}${boardSearchArg} --menuconfig`;
  }

  /**
   * 生成下载命令
   */
  public async getSftoolDownloadCommand(boardName: string, serialPortNum: string): Promise<string> {
    const sftoolParam = await this.readSftoolParamJson(boardName);
    
    if (!sftoolParam) {
      throw new Error(`无法读取 ${boardName} 的 sftool 参数文件`);
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('未找到工作区文件夹');
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const buildFolder = this.getBuildTargetFolder(boardName);
    
    // 构建基础命令
    let command = `sftool -p ${serialPortNum} -c ${sftoolParam.chip}`;
    
    if (sftoolParam.memory) {
      command += ` -m ${sftoolParam.memory.toLowerCase()}`;
    }

    // 处理 write_flash 命令
    if (sftoolParam.write_flash && sftoolParam.write_flash.files && sftoolParam.write_flash.files.length > 0) {
      command += ' write_flash';
      
      // 添加 write_flash 选项
      if (sftoolParam.write_flash.verify) {
        command += ' --verify';
      }
      if (sftoolParam.write_flash.erase_all) {
        command += ' --erase-all';
      }
      if (sftoolParam.write_flash.no_compress) {
        command += ' --no-compress';
      }

      // 添加文件和地址
      for (const fileInfo of sftoolParam.write_flash.files) {
        // 构建完整文件路径
        const fullFilePath = path.isAbsolute(fileInfo.path) 
          ? fileInfo.path 
          : path.join(workspaceRoot, buildFolder, fileInfo.path);

        command += ` ${fileInfo.address} "${fullFilePath}"`;
      }
    } else {
      throw new Error('sftool 参数文件中未找到有效的写入文件配置');
    }

    return command;
  }
}
