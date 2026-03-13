<template>
  <section v-if="sdk" class="space-y-6">
    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">SDK Detail</p>
            <span
              v-if="sdk.isCurrent"
              class="rounded-full bg-vscode-button-background px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-vscode-button-foreground"
            >
              Current
            </span>
          </div>
          <h2 class="mt-3 text-3xl font-semibold tracking-tight">{{ sdk.name }}</h2>
          <p class="mt-2 break-all text-sm text-vscode-input-placeholder">{{ sdk.path }}</p>
        </div>

        <div class="flex flex-wrap gap-3">
          <BaseButton
            v-if="sdk.actions.canActivate && !sdk.isCurrent"
            variant="primary"
            @click="catalogStore.activateSdk(sdk.id)"
          >
            设为当前
          </BaseButton>
          <BaseButton variant="secondary" @click="openPath('openInExplorer', sdk.path)">打开目录</BaseButton>
          <BaseButton variant="secondary" @click="openPath('openInTerminal', sdk.path)">打开终端</BaseButton>
        </div>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-sm">
        <p class="text-xs uppercase tracking-[0.24em] text-vscode-input-placeholder">Git State</p>
        <dl class="mt-5 grid gap-4">
          <div>
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">Ref</dt>
            <dd class="mt-1 break-all text-base font-semibold">{{ sdk.ref }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">Hash</dt>
            <dd class="mt-1 break-all text-sm">{{ sdk.hash || 'N/A' }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">Remote</dt>
            <dd class="mt-1 break-all text-sm">{{ sdk.origin || 'N/A' }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">Tracked Branch</dt>
            <dd class="mt-1 break-all text-sm">{{ sdk.trackedBranch || 'N/A' }}</dd>
          </div>
        </dl>
      </article>

      <article class="rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-sm">
        <p class="text-xs uppercase tracking-[0.24em] text-vscode-input-placeholder">Tools & Files</p>
        <dl class="mt-5 grid gap-4">
          <div>
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">Tools Path</dt>
            <dd class="mt-1 break-all text-sm">{{ sdk.toolsPath || '默认环境' }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">Toolchain Source</dt>
            <dd class="mt-1 text-sm">{{ sdk.toolchainSource || '未记录，按区域默认处理' }}</dd>
          </div>
        </dl>
      </article>
    </div>

    <div>
      <p class="text-xs uppercase tracking-[0.24em] text-vscode-input-placeholder mb-4">Actions</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          v-if="sdk.actions.canSwitchRef"
          class="flex flex-col items-start gap-1 rounded-2xl border border-vscode-panel-border bg-vscode-background p-4 text-left shadow-sm transition-all hover:scale-[1.02] hover:border-vscode-focus-border hover:bg-vscode-input-background/50"
          @click="switchDialogOpen = true"
        >
          <span class="text-sm font-medium text-vscode-foreground">切换版本</span>
          <span class="text-xs text-vscode-input-placeholder mt-0.5 leading-relaxed">切换到其他的分支或标签</span>
        </button>

        <button
          v-if="sdk.actions.canUpdateBranch"
          class="flex flex-col items-start gap-1 rounded-2xl border border-vscode-panel-border bg-vscode-background p-4 text-left shadow-sm transition-all hover:scale-[1.02] hover:border-vscode-focus-border hover:bg-vscode-input-background/50"
          @click="requestTask({ command: 'updateBranchSdk', sdkId: sdk.id })"
        >
          <span class="text-sm font-medium text-vscode-foreground">更新分支</span>
          <span class="text-xs text-vscode-input-placeholder mt-0.5 leading-relaxed">拉取远程代码库的最新更改</span>
        </button>

        <button
          class="flex flex-col items-start gap-1 rounded-2xl border border-vscode-panel-border bg-vscode-background p-4 text-left shadow-sm transition-all hover:scale-[1.02] hover:border-vscode-focus-border hover:bg-vscode-input-background/50"
          @click="renameDialogOpen = true"
        >
          <span class="text-sm font-medium text-vscode-foreground">重命名目录</span>
          <span class="text-xs text-vscode-input-placeholder mt-0.5 leading-relaxed">修改本地 SDK 的文件夹名称</span>
        </button>

        <button
          v-if="sdk.actions.canUpdateTools"
          class="flex flex-col items-start gap-1 rounded-2xl border border-vscode-panel-border bg-vscode-background p-4 text-left shadow-sm transition-all hover:scale-[1.02] hover:border-vscode-focus-border hover:bg-vscode-input-background/50"
          @click="requestTask({ command: 'rerunInstallScript', sdkId: sdk.id })"
        >
          <span class="text-sm font-medium text-vscode-foreground">更新工具</span>
          <span class="text-xs text-vscode-input-placeholder mt-0.5 leading-relaxed">重新执行此 SDK 的安装脚本</span>
        </button>
      </div>
    </div>

    <SwitchSdkRefDialog
      :open="switchDialogOpen"
      :targets="targetsStore.targets"
      :initial-directory-name="sdk.name"
      :busy="taskCenterStore.requestInFlight"
      @close="switchDialogOpen = false"
      @confirm="handleSwitchConfirm"
    />

    <RenameSdkDialog
      :open="renameDialogOpen"
      :initial-name="sdk.name"
      :busy="taskCenterStore.requestInFlight"
      @close="renameDialogOpen = false"
      @confirm="handleRenameConfirm"
    />
  </section>

  <section
    v-else
    class="rounded-3xl border border-dashed border-vscode-panel-border px-6 py-12 text-center text-vscode-input-placeholder"
  >
    正在加载 SDK 详情...
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BaseButton from '@/components/common/BaseButton.vue';
import RenameSdkDialog from '@/components/dialogs/RenameSdkDialog.vue';
import SwitchSdkRefDialog from '@/components/dialogs/SwitchSdkRefDialog.vue';
import { postMessage } from '@/services/vscodeBridge';
import { useSdkCatalogStore } from '@/stores/sdkCatalog';
import { useSdkTargetsStore } from '@/stores/sdkTargets';
import { useTaskCenterStore } from '@/stores/taskCenter';
import type { WebviewMessage } from '@/types';

const route = useRoute();
const router = useRouter();
const catalogStore = useSdkCatalogStore();
const targetsStore = useSdkTargetsStore();
const taskCenterStore = useTaskCenterStore();

const switchDialogOpen = ref(false);
const renameDialogOpen = ref(false);

const sdkId = computed(() => route.params.sdkId as string);
const sdk = computed(() => catalogStore.getSdkDetailById(sdkId.value));

function fetchData() {
  catalogStore.fetchDetail(sdkId.value);
  targetsStore.fetchTargets();
}

onMounted(fetchData);
watch(sdkId, fetchData);

function openPath(command: 'openInExplorer' | 'openInTerminal', targetPath: string) {
  postMessage({
    command,
    path: targetPath,
  });
}

async function requestTask(message: WebviewMessage) {
  try {
    const taskId = await taskCenterStore.requestTask(message);
    await router.push(`/tasks/${taskId}`);
  } catch (error) {
    catalogStore.setBanner(error instanceof Error ? error.message : String(error), 'error');
  }
}

async function handleSwitchConfirm(payload: {
  targetRef: string;
  targetKind: 'branch' | 'tag';
  directoryName: string;
}) {
  switchDialogOpen.value = false;
  await requestTask({
    command: 'switchSdkRef',
    data: {
      sdkId: sdkId.value,
      targetRef: payload.targetRef,
      targetKind: payload.targetKind,
      newDirectoryName: payload.directoryName,
    },
  });
}

async function handleRenameConfirm(directoryName: string) {
  renameDialogOpen.value = false;
  await requestTask({
    command: 'renameSdkDirectory',
    data: {
      sdkId: sdkId.value,
      newDirectoryName: directoryName,
    },
  });
}
</script>
