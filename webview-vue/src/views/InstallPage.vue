<template>
  <section class="space-y-6">
    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">Install</p>
      <h2 class="mt-3 text-3xl font-semibold tracking-tight">安装与导入</h2>
      <p class="mt-2 text-sm text-vscode-input-placeholder">下载新版本，或把现有本地 SDK 纳入管理台。</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        class="rounded-full border px-4 py-2 text-sm transition-colors"
        :class="tab === 'download' ? activeTabClass : inactiveTabClass"
        @click="tab = 'download'"
      >
        下载 SDK
      </button>
      <button
        class="rounded-full border px-4 py-2 text-sm transition-colors"
        :class="tab === 'import' ? activeTabClass : inactiveTabClass"
        @click="tab = 'import'"
      >
        导入已有 SDK
      </button>
    </div>

    <div
      v-if="tab === 'download'"
      class="rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-sm"
    >
      <div class="grid gap-5 lg:grid-cols-2">
        <div>
          <label class="mb-2 block text-sm font-medium">源码源</label>
          <BaseSelect v-model="sdkSourceModel" :options="sdkSourceOptions" />
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium">工具链源</label>
          <BaseSelect v-model="downloadToolchainSourceModel" :options="toolchainSourceOptions" />
        </div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">目标版本</label>
          <BaseSelect
            v-model="selectedTargetRef"
            :options="targetOptions"
            :disabled="targetsStore.loading || targetsStore.targets.length === 0"
            placeholder="请选择目标版本"
          />
        </div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">安装根目录</label>
          <div class="flex gap-3">
            <BaseInput v-model="installPath" readonly placeholder="请选择安装根目录" />
            <BaseButton variant="secondary" @click="browseInstallPath('download-install')">浏览</BaseButton>
          </div>
        </div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">目录名称</label>
          <BaseInput v-model="directoryName" placeholder="用于创建最终 SDK 目录" />
        </div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">工具链目录</label>
          <div class="flex gap-3">
            <BaseInput v-model="downloadToolsPath" readonly placeholder="可选，留空则使用默认环境" />
            <BaseButton variant="secondary" @click="browseToolsPath('download-tools')">浏览</BaseButton>
          </div>
        </div>
      </div>

      <div class="mt-6 flex flex-wrap gap-3">
        <BaseButton variant="secondary" @click="targetsStore.fetchTargets()">刷新远程版本</BaseButton>
        <BaseButton variant="primary" :disabled="!canStartDownload" @click="startDownload">开始安装</BaseButton>
      </div>
    </div>

    <div v-else class="rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-sm">
      <div class="grid gap-5 lg:grid-cols-2">
        <div>
          <label class="mb-2 block text-sm font-medium">工具链源</label>
          <BaseSelect v-model="importToolchainSourceModel" :options="toolchainSourceOptions" />
        </div>
        <div></div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">SDK 路径</label>
          <div class="flex gap-3">
            <BaseInput v-model="existingSdkPath" readonly placeholder="请选择已有 SDK 根目录" />
            <BaseButton variant="secondary" @click="browseInstallPath('import-sdk')">浏览</BaseButton>
          </div>
          <div
            v-if="validation"
            class="mt-3 rounded-2xl border px-4 py-3 text-sm"
            :class="
              validation.valid
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                : 'border-red-500/40 bg-red-500/10 text-red-200'
            "
          >
            <p>{{ validation.message }}</p>
            <p v-if="validation.ref" class="mt-2 break-all text-xs opacity-80">Ref: {{ validation.ref }}</p>
            <p v-if="validation.hash" class="mt-1 break-all text-xs opacity-80">Hash: {{ validation.hash }}</p>
          </div>
        </div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">工具链目录</label>
          <div class="flex gap-3">
            <BaseInput v-model="importToolsPath" readonly placeholder="可选，留空则使用默认环境" />
            <BaseButton variant="secondary" @click="browseToolsPath('import-tools')">浏览</BaseButton>
          </div>
        </div>
      </div>

      <div class="mt-6 flex flex-wrap gap-3">
        <BaseButton variant="secondary" :disabled="!existingSdkPath" @click="validateExistingSdk">重新验证</BaseButton>
        <BaseButton variant="primary" :disabled="!canStartImport" @click="startImport">开始导入</BaseButton>
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
import type { SdkSource, SdkTarget, ToolchainSource } from '@/types';

interface ValidationResult {
  valid: boolean;
  message: string;
  ref?: string;
  hash?: string;
}

type BrowseContext = 'download-install' | 'download-tools' | 'import-sdk' | 'import-tools' | null;

const activeTabClass = 'border-vscode-focus-border bg-vscode-button-background text-vscode-button-foreground';
const inactiveTabClass =
  'border-vscode-panel-border bg-vscode-background text-vscode-foreground hover:border-vscode-focus-border hover:bg-vscode-input-background';

const router = useRouter();
const catalogStore = useSdkCatalogStore();
const targetsStore = useSdkTargetsStore();
const taskCenterStore = useTaskCenterStore();

const tab = ref<'download' | 'import'>('download');
const sdkSource = ref<SdkSource>(catalogStore.defaultSdkSource);
const downloadToolchainSource = ref<ToolchainSource>(catalogStore.defaultToolchainSource);
const installPath = ref('');
const downloadToolsPath = ref('');
const selectedTargetRef = ref('');
const directoryName = ref('');

const importToolchainSource = ref<ToolchainSource>(catalogStore.defaultToolchainSource);
const existingSdkPath = ref('');
const importToolsPath = ref('');
const validation = ref<ValidationResult | null>(null);
const browseContext = ref<BrowseContext>(null);

const targetOptions = computed(() =>
  targetsStore.targets.map(item => ({
    value: item.ref,
    label: `${item.kind === 'branch' ? 'Branch' : 'Tag'} · ${item.label}`,
  }))
);

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
const canStartImport = computed(() => !!validation.value?.valid && !!existingSdkPath.value.trim());
const sdkSourceModel = computed<string>({
  get: () => sdkSource.value,
  set: value => {
    sdkSource.value = value as SdkSource;
  },
});
const downloadToolchainSourceModel = computed<string>({
  get: () => downloadToolchainSource.value,
  set: value => {
    downloadToolchainSource.value = value as ToolchainSource;
  },
});
const importToolchainSourceModel = computed<string>({
  get: () => importToolchainSource.value,
  set: value => {
    importToolchainSource.value = value as ToolchainSource;
  },
});

const disposers: Array<() => void> = [];

watch(
  () => targetsStore.targets,
  (targets: SdkTarget[]) => {
    if (!selectedTargetRef.value && targets.length > 0) {
      selectedTargetRef.value = targets[0].ref;
    }
  },
  { immediate: true }
);

watch(selectedTarget, target => {
  if (target) {
    directoryName.value = target.defaultDirectoryName;
  }
});

onMounted(() => {
  sdkSource.value = catalogStore.defaultSdkSource;
  downloadToolchainSource.value = catalogStore.defaultToolchainSource;
  importToolchainSource.value = catalogStore.defaultToolchainSource;

  targetsStore.fetchTargets();

  disposers.push(
    onMessage<{ path: string }>('installPathSelected', payload => {
      switch (browseContext.value) {
        case 'download-install':
          installPath.value = payload.path;
          break;
        case 'import-sdk':
          existingSdkPath.value = payload.path;
          validateExistingSdk();
          break;
      }
      browseContext.value = null;
    }),
    onMessage<{ path: string }>('toolsPathSelected', payload => {
      switch (browseContext.value) {
        case 'download-tools':
          downloadToolsPath.value = payload.path;
          break;
        case 'import-tools':
          importToolsPath.value = payload.path;
          break;
      }
      browseContext.value = null;
    }),
    onMessage<ValidationResult>('sdkValidationResult', payload => {
      validation.value = payload;
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

function validateExistingSdk() {
  if (!existingSdkPath.value.trim()) {
    validation.value = null;
    return;
  }

  postMessage({
    command: 'validateExistingSdk',
    path: existingSdkPath.value.trim(),
  });
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
        installPath: installPath.value.trim(),
        toolchainSource: downloadToolchainSource.value,
        toolsPath: downloadToolsPath.value.trim(),
      },
    });

    await router.push(`/tasks/${taskId}`);
  } catch (error) {
    catalogStore.setBanner(error instanceof Error ? error.message : String(error), 'error');
  }
}

async function startImport() {
  try {
    const taskId = await taskCenterStore.requestTask({
      command: 'installExistingSdk',
      data: {
        sdkPath: existingSdkPath.value.trim(),
        toolchainSource: importToolchainSource.value,
        toolsPath: importToolsPath.value.trim(),
      },
    });

    await router.push(`/tasks/${taskId}`);
  } catch (error) {
    catalogStore.setBanner(error instanceof Error ? error.message : String(error), 'error');
  }
}
</script>
