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

  const releaseOptions = computed(() => [
    { value: '', label: '请选择一个版本', disabled: true },
    ...state.value.availableReleases.map(release => ({
      value: release.tagName,
      label: release.tagName
    }))
  ]);

  const branchOptions = computed(() => [
    { value: '', label: '请选择一个分支', disabled: true },
    ...state.value.availableBranches.map(branch => ({
      value: branch.name,
      label: branch.name
    }))
  ]);

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
      installPath: state.value.installPath
    });
  };

  // 消息处理器
  onMessage('displayReleases', (data: { releases: SdkRelease[] }) => {
    state.value.availableReleases = data.releases;
    state.value.isLoading = false;
    if (data.releases.length > 0) {
      state.value.selectedVersion = data.releases[0].tagName;
    }
  });

  onMessage('displayBranches', (data: { branches: SdkBranch[] }) => {
    state.value.availableBranches = data.branches;
    state.value.isLoading = false;
    if (data.branches.length > 0) {
      const defaultBranch = data.branches.find(b => 
        b.name === 'main' || b.name === 'master'
      );
      state.value.selectedBranch = defaultBranch 
        ? defaultBranch.name 
        : data.branches[0].name;
    }
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

  // 初始化
  const initialize = () => {
    fetchOptions();
  };

  return {
    state,
    sourceOptions,
    downloadTypeOptions,
    releaseOptions,
    branchOptions,
    isFormValid,
    fetchOptions,
    browsePath,
    installSdk,
    initialize
  };
}
