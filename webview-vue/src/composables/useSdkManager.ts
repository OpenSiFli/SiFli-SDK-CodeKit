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
      .map((v: SdkVersionInfo) => ({
        name: v.version,
        supportedChips: v.supported_chips
      }));
  });

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

  const installSdk = () => {
    state.value.isInstalling = true;
    postMessage({
      command: 'installSdk',
      source: state.value.sdkSource,
      type: state.value.downloadType,
      name: state.value.downloadType === 'release' 
        ? state.value.selectedVersion 
        : state.value.selectedBranch,
      installPath: state.value.installPath
    });
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
      .map(v => ({
        name: v.version
      }));
    
    // 清空选择
    state.value.selectedVersion = '';
    state.value.selectedBranch = '';
    state.value.isLoading = false;
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
    releases,
    branches,
    finalInstallPath,
    isFormValid,
    fetchOptions,
    browsePath,
    installSdk,
    initialize
  };
}
