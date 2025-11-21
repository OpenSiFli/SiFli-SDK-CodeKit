// SiFli SDK 相关常量
export const TERMINAL_NAME = 'SF32';
export const PROJECT_SUBFOLDER = 'project';
export const SRC_SUBFOLDER = 'src';
export const SCONSCRIPT_FILE = 'SConscript';

// 板子发现相关常量
export const CUSTOMER_BOARDS_SUBFOLDER = 'customer/boards';
export const HCPU_SUBFOLDER = 'hcpu';
export const PTAB_JSON_FILE = 'ptab.json';

// sftool 参数文件常量
export const SFTOOL_PARAM_JSON_FILE = 'sftool_param.json';

// 任务名称常量
export const TASK_NAMES = {
  BUILD: 'SiFli: Build',
  DOWNLOAD: 'SiFli: Download',
  MENUCONFIG: 'SiFli: Menuconfig',
  CLEAN: 'SiFli: Clean',
  REBUILD: 'SiFli: Rebuild'
} as const;

// 命令前缀
export const CMD_PREFIX = 'extension.';

// 全局状态键
export const HAS_RUN_INITIAL_SETUP_KEY = 'oneStepForSifli.hasRunInitialSetup';
export const LAST_VERSION_KEY = 'sifli-sdk-codekit.lastVersion';

// Git 仓库常量
export const GIT_REPOS = {
  GITHUB: {
    API_BASE: 'https://api.github.com/repos/OpenSiFli/SiFli-SDK',
    GIT_URL: 'https://github.com/OpenSiFli/SiFli-SDK.git'
  },
  GITEE: {
    API_BASE: 'https://gitee.com/api/v5/repos/SiFli/sifli-sdk',
    GIT_URL: 'https://gitee.com/SiFli/sifli-sdk.git'
  }
} as const;
