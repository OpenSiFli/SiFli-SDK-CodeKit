import { ref, computed, watch } from 'vue';
import { useVsCodeApi } from './useVsCodeApi';
import type { 
  SdkManagerState, 
  SdkSource, 
  DownloadType, 
  SdkRelease, 
  SdkBranch 
} from '@/types';

export function useSdkManager() {
  const { postMessage, onMessage } = useVsCodeApi();

  // 响应式状态
  const state = ref<SdkManagerState>({
    sdkSource: 'github',
    downloadType: 'release',
    availableReleases: [],
    availableBranches: [],
    selectedVersion: '',
    selectedBranch: '',
    installPath: '',
    isLoading: false,
    isInstalling: false
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

  // 计算最终的安装路径
  const finalInstallPath = computed(() => {
    if (!state.value.installPath) return '';
    
    const basePath = state.value.installPath;
    const selectedName = state.value.downloadType === 'release' 
      ? state.value.selectedVersion 
      : state.value.selectedBranch;
    
    if (!selectedName) return basePath;
    
    // 处理分支名称，移除 'release/' 前缀
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
  const fetchOptions = () => {
    state.value.isLoading = true;
    state.value.selectedVersion = '';
    state.value.selectedBranch = '';
    
    if (state.value.downloadType === 'release') {
      postMessage({
        command: 'fetchReleases',
        source: state.value.sdkSource
      });
    } else {
      postMessage({
        command: 'fetchBranches',
        source: state.value.sdkSource
      });
    }
  };

  const browsePath = () => {
    postMessage({
      command: 'browseInstallPath'
    });
  };

  const installSdk = () => {
    const selectedName = state.value.downloadType === 'release' 
      ? state.value.selectedVersion 
      : state.value.selectedBranch;

    if (!selectedName || !state.value.installPath) {
      return;
    }

    state.value.isInstalling = true;
    
    postMessage({
      command: 'startSdkInstallation',
      source: state.value.sdkSource,
      type: state.value.downloadType === 'release' ? 'tag' : 'branch',
      name: selectedName,
      installPath: finalInstallPath.value
    });
  };

  // 消息处理器
  onMessage('displayReleases', (data: { releases: SdkRelease[] }) => {
    console.log('[useSdkManager] Received releases:', data.releases);
    state.value.availableReleases = data.releases;
    state.value.isLoading = false;
    // 不自动选择版本，让用户手动选择
    state.value.selectedVersion = '';
  });

  onMessage('displayBranches', (data: { branches: SdkBranch[] }) => {
    console.log('[useSdkManager] Received branches:', data.branches);
    state.value.availableBranches = data.branches;
    state.value.isLoading = false;
    // 不自动选择分支，让用户手动选择
    state.value.selectedBranch = '';
  });

  onMessage('installPathSelected', (data: { path: string }) => {
    state.value.installPath = data.path;
  });

  onMessage('installationComplete', () => {
    state.value.isInstalling = false;
  });

  onMessage('installationError', (data: { error: string }) => {
    state.value.isInstalling = false;
    console.error('Installation error:', data.error);
  });

  onMessage('error', (data: { message: string }) => {
    state.value.isLoading = false;
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
    finalInstallPath,
    isFormValid,
    fetchOptions,
    browsePath,
    installSdk,
    initialize
  };
}
