export interface Board {
  name: string;
  path: string;
  type: 'sdk' | 'custom' | 'project_local';
}

export interface BoardDiscoveryResult {
  boards: Board[];
  sdkBoards: Board[];
  customBoards: Board[];
  projectLocalBoards: Board[];
}

export interface SftoolParam {
  load_file?: string;
  load_addr?: string;
  [key: string]: any;
}
