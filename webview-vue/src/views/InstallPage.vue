<template>
  <section class="space-y-6">
    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">Install</p>
      <h2 class="mt-3 text-3xl font-semibold tracking-tight">下载 SDK</h2>
      <p class="mt-2 text-sm text-vscode-input-placeholder">从云端下载并安装全新的 SiFli SDK 到本地计算机。</p>
    </div>

    <div class="rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-sm">
      <div class="grid gap-5 lg:grid-cols-2">
        <div>
          <label class="mb-2 block text-sm font-medium">源码源</label>
          <BaseSelect v-model="sdkSourceModel" :options="sdkSourceOptions" />
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium">工具链源</label>
          <BaseSelect v-model="downloadToolchainSourceModel" :options="toolchainSourceOptions" />
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium">版本类别</label>
          <BaseSelect
            v-model="targetCategoryModel"
            :options="[
              { value: 'branch', label: '分支分支 (Branch)' },
              { value: 'tag', label: '发布版本 (Release/Tag)' },
            ]"
            placeholder="请选择版本类别"
          />
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium">目标版本</label>
          <BaseSelect
            v-model="selectedTargetRef"
            :options="filteredTargetOptions"
            :disabled="targetsStore.loading || targetsStore.targets.length === 0 || !targetCategory"
            placeholder="请选择目标版本"
          />
        </div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">输入 SiFli SDK 容器目录：</label>
          <div class="flex gap-3">
            <div class="input-group">
              <input
                v-model="installPath"
                placeholder="请选择根目录..."
                class="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-vscode-foreground focus:outline-none"
              />
              <div class="input-addon">/SiFli-SDK/{{ directoryName || '{版本目录}' }}</div>
            </div>
            <BaseButton variant="primary" class="shrink-0" @click="browseInstallPath('download-install')">
              <span class="flex items-center gap-1.5 whitespace-nowrap">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                浏览
              </span>
            </BaseButton>
          </div>
        </div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">目录名称</label>
          <BaseInput v-model="directoryName" placeholder="用于创建最终的 SDK 子目录名" />
        </div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">工具链目录</label>
          <div class="flex gap-3">
            <BaseInput v-model="downloadToolsPath" placeholder="可选，留空则使用默认环境" />
            <BaseButton variant="primary" class="shrink-0" @click="browseToolsPath('download-tools')">
              <span class="flex items-center gap-1.5 whitespace-nowrap">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                浏览
              </span>
            </BaseButton>
          </div>
        </div>
      </div>

      <div class="mt-8 flex justify-center">
        <BaseButton variant="primary" class="px-8" :disabled="!canStartDownload" @click="startDownload"
          >开始安装</BaseButton
        >
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import BaseButton from '@/components/common/BaseButton.vue';
import BaseInput from '@/components/common/BaseInput.vue';
import BaseSelect from '@/components/common/BaseSelect.vue';
import { onMessage, postMessage } from '@/services/vscodeBridge';
import { useSdkCatalogStore } from '@/stores/sdkCatalog';
import { useSdkTargetsStore } from '@/stores/sdkTargets';
import { useTaskCenterStore } from '@/stores/taskCenter';
import type { SdkSource, ToolchainSource } from '@/types';

type BrowseContext = 'download-install' | 'download-tools' | null;

const router = useRouter();
const catalogStore = useSdkCatalogStore();
const targetsStore = useSdkTargetsStore();
const taskCenterStore = useTaskCenterStore();

const sdkSource = ref<SdkSource>(catalogStore.defaultSdkSource);
const downloadToolchainSource = ref<ToolchainSource>(catalogStore.defaultToolchainSource);
const installPath = ref('');
const downloadToolsPath = ref('');
const targetCategory = ref<'branch' | 'tag' | ''>('');
const selectedTargetRef = ref('');
const directoryName = ref('');

const targetCategoryModel = computed<string>({
  get: () => targetCategory.value,
  set: value => {
    targetCategory.value = value as 'branch' | 'tag' | '';
  },
});

const browseContext = ref<BrowseContext>(null);

const filteredTargetOptions = computed(() => {
  if (!targetCategory.value) {
    return [];
  }
  return targetsStore.targets
    .filter(t => t.kind === targetCategory.value)
    .map(item => ({
      value: item.ref,
      label: item.label,
    }));
});

const selectedTarget = computed(() => targetsStore.findTarget(selectedTargetRef.value));
const sdkSourceOptions: Array<{ value: SdkSource; label: string }> = [
  { value: 'github', label: 'GitHub' },
  { value: 'gitee', label: 'Gitee' },
];
const toolchainSourceOptions: Array<{ value: ToolchainSource; label: string }> = [
  { value: 'github', label: 'GitHub' },
  { value: 'sifli', label: 'SiFli 镜像' },
];

const canStartDownload = computed(
  () => !!selectedTarget.value && !!installPath.value.trim() && !!directoryName.value.trim()
);
const sdkSourceModel = computed<string>({
  get: () => sdkSource.value,
  set: value => {
    sdkSource.value = value as SdkSource;
    if (value === 'gitee') {
      downloadToolchainSource.value = 'sifli';
    }
  },
});
const downloadToolchainSourceModel = computed<string>({
  get: () => downloadToolchainSource.value,
  set: value => {
    downloadToolchainSource.value = value as ToolchainSource;
  },
});

const disposers: Array<() => void> = [];

watch(targetCategory, category => {
  if (category) {
    const firstAvailable = targetsStore.targets.find(t => t.kind === category);
    if (firstAvailable) {
      selectedTargetRef.value = firstAvailable.ref;
    } else {
      selectedTargetRef.value = '';
    }
  } else {
    selectedTargetRef.value = '';
  }
});

watch(selectedTarget, target => {
  if (target) {
    directoryName.value = target.defaultDirectoryName;
  }
});

onMounted(() => {
  sdkSource.value = catalogStore.defaultSdkSource;
  downloadToolchainSource.value = catalogStore.defaultToolchainSource;

  targetsStore.fetchTargets();

  disposers.push(
    watch(
      () => targetsStore.targets,
      targets => {
        if (targets.length > 0 && !targetCategory.value) {
          targetCategory.value = 'branch';
        }
      },
      { immediate: true }
    ),
    onMessage<{ path: string }>('installPathSelected', payload => {
      if (browseContext.value === 'download-install') {
        installPath.value = payload.path;
      }
      browseContext.value = null;
    }),
    onMessage<{ path: string }>('toolsPathSelected', payload => {
      if (browseContext.value === 'download-tools') {
        downloadToolsPath.value = payload.path;
      }
      browseContext.value = null;
    })
  );
});

onBeforeUnmount(() => {
  disposers.forEach(dispose => dispose());
});

function browseInstallPath(context: BrowseContext) {
  browseContext.value = context;
  postMessage({ command: 'browseInstallPath' });
}

function browseToolsPath(context: BrowseContext) {
  browseContext.value = context;
  postMessage({ command: 'browseToolsPath' });
}

async function startDownload() {
  if (!selectedTarget.value) {
    return;
  }

  try {
    const taskId = await taskCenterStore.requestTask({
      command: 'installSdk',
      data: {
        sdkSource: sdkSource.value,
        targetRef: selectedTarget.value.ref,
        targetKind: selectedTarget.value.kind,
        directoryName: directoryName.value.trim(),
        installPath: `${installPath.value.trim()}/SiFli-SDK`,
        toolchainSource: downloadToolchainSource.value,
        toolsPath: downloadToolsPath.value.trim(),
      },
    });

    await router.push(`/tasks/${taskId}`);
  } catch (error) {
    catalogStore.setBanner(error instanceof Error ? error.message : String(error), 'error');
  }
}
</script>
