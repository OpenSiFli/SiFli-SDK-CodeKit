<template>
  <section class="space-y-6">
    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">
        {{ t('sdkInstall.sectionLabel') }}
      </p>
      <h2 class="mt-3 text-3xl font-semibold tracking-tight">{{ t('sdkInstall.title') }}</h2>
      <p class="mt-2 text-sm text-vscode-input-placeholder">{{ t('sdkInstall.subtitle') }}</p>
    </div>

    <div class="rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-sm">
      <div class="grid gap-5 lg:grid-cols-2">
        <div>
          <label class="mb-2 block text-sm font-medium">{{ t('sdkInstall.form.source') }}</label>
          <BaseSelect v-model="sdkSourceModel" :options="sdkSourceOptions" />
        </div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">{{ t('sdk.toolchainMirror.label') }}</label>
          <ToolchainMirrorConfig
            :source="downloadToolchainSource"
            :mirror-urls="downloadToolchainMirrorUrls"
            @update:source="downloadToolchainSource = $event"
            @update:mirror-urls="downloadToolchainMirrorUrls = $event"
          />
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium">{{ t('sdkInstall.form.targetCategory') }}</label>
          <BaseSelect
            v-model="targetCategoryModel"
            :options="targetCategoryOptions"
            :placeholder="t('sdkInstall.form.targetCategoryPlaceholder')"
          />
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium">{{ t('sdkInstall.form.targetVersion') }}</label>
          <BaseSelect
            v-model="selectedTargetRef"
            :options="filteredTargetOptions"
            :disabled="targetsStore.loading || targetsStore.targets.length === 0 || !targetCategory"
            :placeholder="t('sdkInstall.form.targetVersionPlaceholder')"
          />
        </div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">{{ t('sdkInstall.form.containerPath') }}</label>
          <div class="flex gap-3">
            <div class="input-group">
              <input
                v-model="installPath"
                :placeholder="t('sdkInstall.form.rootPlaceholder')"
                class="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-vscode-foreground focus:outline-none"
              />
              <div class="input-addon">/SiFli-SDK/{{ directoryName || t('sdkInstall.form.versionDirectory') }}</div>
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
                {{ t('common.browse') }}
              </span>
            </BaseButton>
          </div>
        </div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">{{ t('sdkInstall.form.directoryName') }}</label>
          <BaseInput v-model="directoryName" :placeholder="t('sdkInstall.form.directoryNamePlaceholder')" />
        </div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">{{ t('sdkInstall.form.toolsPath') }}</label>
          <div class="flex gap-3">
            <BaseInput v-model="downloadToolsPath" :placeholder="t('sdkInstall.form.toolsPathPlaceholder')" />
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
                {{ t('common.browse') }}
              </span>
            </BaseButton>
          </div>
        </div>
      </div>

      <div class="mt-8 flex justify-center">
        <BaseButton variant="primary" class="px-8" :disabled="!canStartDownload" @click="startDownload">{{
          t('sdkInstall.form.start')
        }}</BaseButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import BaseButton from '@/components/common/BaseButton.vue';
import BaseInput from '@/components/common/BaseInput.vue';
import BaseSelect from '@/components/common/BaseSelect.vue';
import ToolchainMirrorConfig from '@/components/sdk/ToolchainMirrorConfig.vue';
import { onMessage, postMessage } from '@/services/vscodeBridge';
import { useSdkCatalogStore } from '@/stores/sdkCatalog';
import { useSdkTargetsStore } from '@/stores/sdkTargets';
import { useTaskCenterStore } from '@/stores/taskCenter';
import type { SdkSource, ToolchainMirrorUrls, ToolchainSource } from '@/types';
import { compactMirrorUrls, getMirrorValidationIssue } from '@/utils/toolchainMirror';

type BrowseContext = 'download-install' | 'download-tools' | null;

const router = useRouter();
const { t } = useI18n();
const catalogStore = useSdkCatalogStore();
const targetsStore = useSdkTargetsStore();
const taskCenterStore = useTaskCenterStore();

const sdkSource = ref<SdkSource>(catalogStore.defaultSdkSource);
const downloadToolchainSource = ref<ToolchainSource>(catalogStore.defaultToolchainSource);
const downloadToolchainMirrorUrls = ref<ToolchainMirrorUrls>({});
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
const targetCategoryOptions = computed(() => [
  { value: 'branch', label: t('sdkInstall.form.branchOption') },
  { value: 'tag', label: t('sdkInstall.form.tagOption') },
]);

const selectedTarget = computed(() => targetsStore.findTarget(selectedTargetRef.value));
const sdkSourceOptions = computed<Array<{ value: SdkSource; label: string }>>(() => [
  { value: 'github', label: t('sdkSource.github') },
  { value: 'gitee', label: t('sdkSource.gitee') },
]);
const canStartDownload = computed(
  () =>
    !!selectedTarget.value &&
    !!installPath.value.trim() &&
    !!directoryName.value.trim() &&
    !downloadMirrorValidation.value
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
const downloadMirrorValidation = computed(() =>
  getMirrorValidationIssue(downloadToolchainSource.value, downloadToolchainMirrorUrls.value)
);

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
    const containerPath = installPath.value.trim();
    const taskId = await taskCenterStore.requestTask({
      command: 'installSdk',
      data: {
        sdkSource: sdkSource.value,
        targetRef: selectedTarget.value.ref,
        targetKind: selectedTarget.value.kind,
        directoryName: directoryName.value.trim(),
        installPath: containerPath,
        toolchainSource: downloadToolchainSource.value,
        toolchainMirrorUrls: compactMirrorUrls(downloadToolchainMirrorUrls.value),
        toolsPath: downloadToolsPath.value.trim(),
      },
    });

    await router.push(`/tasks/${taskId}`);
  } catch (error) {
    catalogStore.setBanner(error instanceof Error ? error.message : String(error), 'error');
  }
}
</script>
