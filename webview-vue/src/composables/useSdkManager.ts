import { ref, computed, watch } from 'vue';
import { useVsCodeApi } from './useVsCodeApi';
import type { 
  SdkManagerState, 
  SdkVersionInfo
} from '@/types';

export function useSdkManager() {
  const { postMessage, onMessage } = useVsCodeApi();

  // 响应式状态
  const state = ref<SdkManagerState>({
    sdkSource: 'github',
    downloadType: 'release',
    availableVersions: [], // 新的统一版本信息
    selectedVersion: '',
    selectedBranch: '',
    installPath: '',
    toolchainSource: 'github',
    toolsPath: '',
    isLoading: false,
    isInstalling: false,
    installationProgress: {
      message: '',
      percentage: 0
    },
    installationLogs: [] // 初始化日志数组
  });

  // 计算属性
  const sourceOptions = computed(() => [
    { value: 'github', label: 'GitHub' },
    { value: 'gitee', label: 'Gitee' }
  ]);

  const downloadTypeOptions = computed(() => [
    { value: 'release', label: '发布版本 (Release)' },
    { value: 'branch', label: '开发分支 (Branch)' }
  ]);

  // 从统一版本信息中分离发布版本和分支
  const releases = computed(() => {
    return state.value.availableVersions
      .filter((v: SdkVersionInfo) => !v.type || v.type !== 'branch')
      .map((v: SdkVersionInfo) => ({
        tagName: v.version,
        name: v.version,
        supportedChips: v.supported_chips
      }));
  });

  const branches = computed(() => {
    return state.value.availableVersions
      .filter((v: SdkVersionInfo) => v.type === 'branch')
      .map((v: SdkVersionInfo) => {
        let branchName = v.version;
        
        // 处理分支名称逻辑
        if (v.version === 'latest') {
          // latest 分支改为 main
          branchName = 'main';
        } else {
          // 其他分支加上 release/ 前缀
          branchName = `release/${v.version}`;
        }
        
        return {
          name: branchName,
          supportedChips: v.supported_chips
        };
      });
  });

  // 计算最终的安装路径
  const finalInstallPath = computed(() => {
    if (!state.value.installPath) return '';
    
    const basePath = state.value.installPath;
    const selectedName = state.value.downloadType === 'release' 
      ? state.value.selectedVersion 
      : state.value.selectedBranch;
    
    if (!selectedName) return basePath;
    
    // 处理分支名称，移除 'release/' 前缀用于目录名
    let folderName = selectedName;
    if (state.value.downloadType === 'branch' && selectedName.startsWith('release/')) {
      folderName = selectedName.replace('release/', '');
    }
    
    return `${basePath}/SiFli-SDK/${folderName}`;
  });

  const isFormValid = computed(() => {
    const hasSelection = state.value.downloadType === 'release' 
      ? state.value.selectedVersion 
      : state.value.selectedBranch;
    return hasSelection && state.value.installPath && !state.value.isInstalling;
  });

  // 监听器
  watch([
    () => state.value.sdkSource,
    () => state.value.downloadType
  ], () => {
    fetchOptions();
  });

  // 方法
  const fetchOptions = async () => {
    try {
      state.value.isLoading = true;
      
      // 通过后端获取版本信息以避免 CORS 问题
      postMessage({
        command: 'fetchVersions'
      });
      
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      state.value.isLoading = false;
    }
  };

  const browsePath = () => {
    postMessage({
      command: 'browseInstallPath'
    });
  };

  const browseToolsPath = () => {
    postMessage({
      command: 'browseToolsPath'
    });
  };

  const installSdk = () => {
    if (!isFormValid.value) {
      console.warn('Form is not valid, cannot install SDK');
      return;
    }

    try {
      state.value.isInstalling = true;
      state.value.installationProgress = {
        message: '准备安装...',
        percentage: 0
      };

      // 确定版本信息
      const selectedVersionInfo = state.value.downloadType === 'release'
        ? state.value.availableVersions.find((v: SdkVersionInfo) => v.version === state.value.selectedVersion)
        : state.value.availableVersions.find((v: SdkVersionInfo) => v.type === 'branch' && 
            (v.version === 'latest' ? 'main' : `release/${v.version}`) === state.value.selectedBranch);

      if (!selectedVersionInfo) {
        throw new Error('未找到选择的版本信息');
      }

      console.log('[useSdkManager] Starting SDK installation with data:', {
        sdkSource: state.value.sdkSource,
        version: selectedVersionInfo,
        installPath: state.value.installPath,
        toolchainSource: state.value.toolchainSource,
        toolsPath: state.value.toolsPath
      });

      // 发送安装请求
      postMessage({
        command: 'installSdk',
        data: {
          sdkSource: state.value.sdkSource,
          version: {
            name: selectedVersionInfo.version,
            tagName: selectedVersionInfo.version,
            type: selectedVersionInfo.type || 'release'
          },
          installPath: state.value.installPath,
          toolchainSource: state.value.toolchainSource,
          toolsPath: state.value.toolsPath
        }
      });

    } catch (error) {
      console.error('Installation failed:', error);
      state.value.isInstalling = false;
      state.value.installationProgress = {
        message: '安装失败: ' + (error instanceof Error ? error.message : String(error)),
        percentage: 0
      };
    }
  };

  // 消息处理器
  onMessage('displayVersions', (data: { versions: SdkVersionInfo[] }) => {
    console.log('[useSdkManager] Received versions:', data.versions);
    state.value.availableVersions = data.versions;
    
    // 为兼容性更新旧数组
    state.value.availableReleases = data.versions
      .filter(v => !v.type || v.type !== 'branch')
      .map(v => ({
        tagName: v.version,
        name: v.version
      }));
    
    state.value.availableBranches = data.versions
      .filter(v => v.type === 'branch')
      .map(v => {
        let displayName = v.version;
        if (v.version === 'latest') {
          displayName = 'main';
        } else {
          displayName = `release/${v.version}`;
        }
        return {
          name: displayName
        };
      });
    
    // 清空选择
    state.value.selectedVersion = '';
    state.value.selectedBranch = '';
    state.value.isLoading = false;
  });

  onMessage('installPathSelected', (data: { path: string }) => {
    state.value.installPath = data.path;
  });

  onMessage('toolsPathSelected', (data: { path: string }) => {
    state.value.toolsPath = data.path;
  });

  onMessage('installationStarted', (data: { message: string }) => {
    // 清空之前的日志
    state.value.installationLogs = [];
    state.value.installationProgress = {
      message: data.message,
      percentage: 0
    };
  });

  // 新增日志消息处理
  onMessage('installationLog', (data: { log: string }) => {
    state.value.installationLogs.push(data.log);
  });

  onMessage('installationProgress', (data: { message: string; percentage: number }) => {
    state.value.installationProgress = {
      message: data.message,
      percentage: data.percentage
    };
  });

  onMessage('installationCompleted', (data: { message: string; path: string }) => {
    state.value.isInstalling = false;
    state.value.installationProgress = {
      message: data.message,
      percentage: 100
    };
    
    // 可以在这里添加成功后的处理逻辑
    console.log('SDK 安装完成于:', data.path);
  });

  onMessage('installationFailed', (data: { message: string }) => {
    state.value.isInstalling = false;
    state.value.installationProgress = {
      message: data.message,
      percentage: 0
    };
  });

  onMessage('error', (data: { message: string }) => {
    state.value.isLoading = false;
    state.value.isInstalling = false;
    console.error('API error:', data.message);
  });

  // 初始化
  const initialize = () => {
    fetchOptions();
  };

  return {
    state,
    sourceOptions,
    downloadTypeOptions,
    releases,
    branches,
    finalInstallPath,
    isFormValid,
    fetchOptions,
    browsePath,
    browseToolsPath,
    installSdk,
    initialize
  };
}
