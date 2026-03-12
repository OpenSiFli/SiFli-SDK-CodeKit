// SiFli SDK 相关常量
export const TERMINAL_NAME = 'SF32';
export const PROJECT_SUBFOLDER = 'project';
export const SRC_SUBFOLDER = 'src';
export const SCONSCRIPT_FILE = 'SConscript';

// 板子发现相关常量
export const CUSTOMER_BOARDS_SUBFOLDER = 'customer/boards';
export const HCPU_SUBFOLDER = 'hcpu';
export const LCPU_SUBFOLDER = 'lcpu';
export const PTAB_JSON_FILE = 'ptab.json';

// sftool 参数文件常量
export const SFTOOL_PARAM_JSON_FILE = 'sftool_param.json';

// 任务名称常量
export const TASK_NAMES = {
  BUILD: 'SiFli: Build',
  DOWNLOAD: 'SiFli: Download',
  MENUCONFIG: 'SiFli: Menuconfig',
  CLEAN: 'SiFli: Clean',
  REBUILD: 'SiFli: Rebuild',
  WORKFLOW_SHELL: 'SiFli: Workflow Shell',
} as const;

// 命令前缀
export const CMD_PREFIX = 'extension.';
export const SIFLI_PROJECT_CONTEXT_KEY = 'sifli.isProject';

// 全局状态键
export const HAS_RUN_INITIAL_SETUP_KEY = 'oneStepForSifli.hasRunInitialSetup';
export const LAST_VERSION_KEY = 'sifli-sdk-codekit.lastVersion';

export const LM_TOOL_NAMES = {
  GET_PROJECT_STATE: 'sifli-sdk-codekit_getProjectState',
  LIST_WORKFLOWS: 'sifli-sdk-codekit_listWorkflows',
  LIST_BOARDS: 'sifli-sdk-codekit_listBoards',
  LIST_SERIAL_PORTS: 'sifli-sdk-codekit_listSerialPorts',
  RUN_WORKFLOW: 'sifli-sdk-codekit_runWorkflow',
  COMPILE: 'sifli-sdk-codekit_compile',
  REBUILD: 'sifli-sdk-codekit_rebuild',
  CLEAN: 'sifli-sdk-codekit_clean',
  DOWNLOAD: 'sifli-sdk-codekit_download',
  SELECT_BOARD: 'sifli-sdk-codekit_selectBoard',
  SELECT_SERIAL_PORT: 'sifli-sdk-codekit_selectSerialPort',
  OPEN_MONITOR: 'sifli-sdk-codekit_openMonitor',
  CLOSE_MONITOR: 'sifli-sdk-codekit_closeMonitor',
} as const;

export const MCP_SERVER_LABEL = 'SiFli CodeKit';
export const MCP_SERVER_DEFINITION_PROVIDER_ID = 'sifli-sdk-codekit.embedded-mcp';

/**
 * 配置迁移版本记录
 * 当需要添加新的配置迁移时，在此添加新的版本号
 * 迁移逻辑会根据用户上次使用的版本号决定是否执行迁移
 */
export const CONFIG_MIGRATION_VERSIONS = {
  /**
   * v1.2.2: 将以下配置从 settings.json 迁移到 workspaceState
   * - defaultChipModule
   * - selectedSerialPort
   * - numThreads
   * - sifliSdkExportScriptPath
   * - downloadBaudRate (新增)
   * - monitorBaudRate (新增)
   */
  WORKSPACE_STATE_MIGRATION: '1.2.2',
} as const;

// Git 仓库常量
export const GIT_REPOS = {
  GITHUB: {
    API_BASE: 'https://api.github.com/repos/OpenSiFli/SiFli-SDK',
    GIT_URL: 'https://github.com/OpenSiFli/SiFli-SDK.git',
  },
  GITEE: {
    API_BASE: 'https://gitee.com/api/v5/repos/SiFli/sifli-sdk',
    GIT_URL: 'https://gitee.com/SiFli/sifli-sdk.git',
  },
} as const;
