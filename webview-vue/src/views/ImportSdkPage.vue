<template>
  <section class="space-y-6">
    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">Import</p>
      <h2 class="mt-3 text-3xl font-semibold tracking-tight">导入 SDK</h2>
      <p class="mt-2 text-sm text-vscode-input-placeholder">将本地已有的 SDK 添加到管理台中。</p>
    </div>

    <div class="rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-sm">
      <div class="grid gap-5 lg:grid-cols-2">
        <div>
          <label class="mb-2 block text-sm font-medium">工具链源</label>
          <BaseSelect v-model="importToolchainSourceModel" :options="toolchainSourceOptions" />
        </div>
        <div></div>
        <div class="lg:col-span-2">
          <label class="mb-2 block text-sm font-medium">SDK 路径</label>
          <div class="flex gap-3">
            <BaseInput
              v-model="existingSdkPath"
              placeholder="请选择或手动输入已有 SDK 根目录"
              @blur="validateExistingSdk"
            />
            <BaseButton variant="primary" class="shrink-0" @click="browseInstallPath('import-sdk')">
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
            <BaseInput v-model="importToolsPath" placeholder="可选，留空则使用默认环境" />
            <BaseButton variant="primary" class="shrink-0" @click="browseToolsPath('import-tools')">
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

      <div class="mt-8 flex justify-center gap-3">
        <BaseButton variant="secondary" :disabled="!existingSdkPath" @click="validateExistingSdk">重新验证</BaseButton>
        <BaseButton variant="primary" class="px-8" :disabled="!canStartImport" @click="startImport"
          >开始导入</BaseButton
        >
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BaseButton from '@/components/common/BaseButton.vue';
import BaseInput from '@/components/common/BaseInput.vue';
import BaseSelect from '@/components/common/BaseSelect.vue';
import { onMessage, postMessage } from '@/services/vscodeBridge';
import { useSdkCatalogStore } from '@/stores/sdkCatalog';
import { useTaskCenterStore } from '@/stores/taskCenter';
import type { ToolchainSource } from '@/types';

interface ValidationResult {
  valid: boolean;
  message: string;
  ref?: string;
  hash?: string;
}

type BrowseContext = 'import-sdk' | 'import-tools' | null;

const router = useRouter();
const catalogStore = useSdkCatalogStore();
const taskCenterStore = useTaskCenterStore();

const importToolchainSource = ref<ToolchainSource>(catalogStore.defaultToolchainSource);
const existingSdkPath = ref('');
const importToolsPath = ref('');
const validation = ref<ValidationResult | null>(null);
const browseContext = ref<BrowseContext>(null);

const toolchainSourceOptions: Array<{ value: ToolchainSource; label: string }> = [
  { value: 'github', label: 'GitHub' },
  { value: 'sifli', label: 'SiFli 镜像' },
];

const canStartImport = computed(() => !!validation.value?.valid && !!existingSdkPath.value.trim());

const importToolchainSourceModel = computed<string>({
  get: () => importToolchainSource.value,
  set: value => {
    importToolchainSource.value = value as ToolchainSource;
  },
});

const disposers: Array<() => void> = [];

onMounted(() => {
  importToolchainSource.value = catalogStore.defaultToolchainSource;

  disposers.push(
    onMessage<{ path: string }>('installPathSelected', payload => {
      if (browseContext.value === 'import-sdk') {
        existingSdkPath.value = payload.path;
        validateExistingSdk();
      }
      browseContext.value = null;
    }),
    onMessage<{ path: string }>('toolsPathSelected', payload => {
      if (browseContext.value === 'import-tools') {
        importToolsPath.value = payload.path;
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
