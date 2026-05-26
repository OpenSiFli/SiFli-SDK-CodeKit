<template>
  <section v-if="sdk" class="space-y-6">
    <div class="rounded-[2rem] border border-vscode-panel-border bg-vscode-background px-6 py-6 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs uppercase tracking-[0.28em] text-vscode-input-placeholder">
              {{ t('sdk.detail.sectionLabel') }}
            </p>
            <span
              v-if="sdk.isCurrent"
              class="rounded-full bg-vscode-button-background px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-vscode-button-foreground"
            >
              {{ t('sdk.state.current') }}
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
            {{ t('sdk.card.activateCurrent') }}
          </BaseButton>
          <BaseButton variant="secondary" @click="openPath('openInExplorer', sdk.path)">
            {{ t('sdk.detail.openDirectory') }}
          </BaseButton>
          <BaseButton variant="secondary" @click="openPath('openInTerminal', sdk.path)">
            {{ t('sdk.detail.openTerminal') }}
          </BaseButton>
        </div>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-sm">
        <p class="text-xs uppercase tracking-[0.24em] text-vscode-input-placeholder">{{ t('sdk.detail.gitState') }}</p>
        <dl class="mt-5 grid gap-4">
          <div>
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">{{ t('sdk.labels.ref') }}</dt>
            <dd class="mt-1 break-all text-base font-semibold">{{ sdk.ref }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">{{ t('sdk.labels.hash') }}</dt>
            <dd class="mt-1 break-all text-sm">{{ sdk.hash || t('common.notAvailable') }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">
              {{ t('sdk.labels.remote') }}
            </dt>
            <dd class="mt-1 break-all text-sm">{{ sdk.origin || t('common.notAvailable') }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">
              {{ t('sdk.labels.trackedBranch') }}
            </dt>
            <dd class="mt-1 break-all text-sm">{{ sdk.trackedBranch || t('common.notAvailable') }}</dd>
          </div>
        </dl>
      </article>

      <article class="rounded-3xl border border-vscode-panel-border bg-vscode-background p-6 shadow-sm">
        <p class="text-xs uppercase tracking-[0.24em] text-vscode-input-placeholder">
          {{ t('sdk.detail.toolsAndFiles') }}
        </p>
        <dl class="mt-5 grid gap-4">
          <div>
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">
              {{ t('sdk.labels.toolsPath') }}
            </dt>
            <dd class="mt-1 break-all text-sm">{{ sdk.toolsPath || t('common.defaultEnvironment') }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">
              {{ t('sdk.toolchainMirror.detail.source') }}
            </dt>
            <dd class="mt-1 text-sm">{{ t(mirrorSourceLabelKey(sdk.toolchainSource)) }}</dd>
          </div>
          <div v-if="sdk.toolchainSource === 'custom' && configuredMirrorUrls.length > 0">
            <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">
              {{ t('sdk.toolchainMirror.detail.urls') }}
            </dt>
            <dd class="mt-2 grid gap-2 text-xs">
              <div v-for="item in configuredMirrorUrls" :key="item.key" class="break-all">
                <span class="text-vscode-input-placeholder">{{ t(item.labelKey) }}: </span>
                <span>{{ item.value }}</span>
              </div>
            </dd>
          </div>
        </dl>
      </article>
    </div>

    <div>
      <p class="text-xs uppercase tracking-[0.24em] text-vscode-input-placeholder mb-4">
        {{ t('sdk.detail.actions') }}
      </p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          v-if="sdk.actions.canSwitchRef"
          class="flex flex-col items-start gap-1 rounded-2xl border border-vscode-panel-border bg-vscode-background p-4 text-left shadow-sm transition-all hover:scale-[1.02] hover:border-vscode-focus-border hover:bg-vscode-input-background/50"
          @click="switchDialogOpen = true"
        >
          <span class="text-sm font-medium text-vscode-foreground">
            {{ t('sdk.detail.actionCards.switchRef.title') }}
          </span>
          <span class="text-xs text-vscode-input-placeholder mt-0.5 leading-relaxed">
            {{ t('sdk.detail.actionCards.switchRef.description') }}
          </span>
        </button>

        <button
          v-if="sdk.actions.canUpdateBranch"
          class="flex flex-col items-start gap-1 rounded-2xl border border-vscode-panel-border bg-vscode-background p-4 text-left shadow-sm transition-all hover:scale-[1.02] hover:border-vscode-focus-border hover:bg-vscode-input-background/50"
          @click="requestTask({ command: 'updateBranchSdk', sdkId: sdk.id })"
        >
          <span class="text-sm font-medium text-vscode-foreground">
            {{ t('sdk.detail.actionCards.updateBranch.title') }}
          </span>
          <span class="text-xs text-vscode-input-placeholder mt-0.5 leading-relaxed">
            {{ t('sdk.detail.actionCards.updateBranch.description') }}
          </span>
        </button>

        <button
          class="flex flex-col items-start gap-1 rounded-2xl border border-vscode-panel-border bg-vscode-background p-4 text-left shadow-sm transition-all hover:scale-[1.02] hover:border-vscode-focus-border hover:bg-vscode-input-background/50"
          @click="renameDialogOpen = true"
        >
          <span class="text-sm font-medium text-vscode-foreground">
            {{ t('sdk.detail.actionCards.rename.title') }}
          </span>
          <span class="text-xs text-vscode-input-placeholder mt-0.5 leading-relaxed">
            {{ t('sdk.detail.actionCards.rename.description') }}
          </span>
        </button>

        <button
          v-if="sdk.actions.canUpdateTools"
          class="flex flex-col items-start gap-1 rounded-2xl border border-vscode-panel-border bg-vscode-background p-4 text-left shadow-sm transition-all hover:scale-[1.02] hover:border-vscode-focus-border hover:bg-vscode-input-background/50"
          @click="requestTask({ command: 'rerunInstallScript', sdkId: sdk.id })"
        >
          <span class="text-sm font-medium text-vscode-foreground">
            {{ t('sdk.detail.actionCards.updateTools.title') }}
          </span>
          <span class="text-xs text-vscode-input-placeholder mt-0.5 leading-relaxed">
            {{ t('sdk.detail.actionCards.updateTools.description') }}
          </span>
        </button>

        <button
          v-if="sdk.actions.canEditToolchain"
          class="flex flex-col items-start gap-1 rounded-2xl border border-vscode-panel-border bg-vscode-background p-4 text-left shadow-sm transition-all hover:scale-[1.02] hover:border-vscode-focus-border hover:bg-vscode-input-background/50"
          @click="editToolchainDialogOpen = true"
        >
          <span class="text-sm font-medium text-vscode-foreground">
            {{ t('sdk.detail.actionCards.editToolchain.title') }}
          </span>
          <span class="text-xs text-vscode-input-placeholder mt-0.5 leading-relaxed">
            {{ t('sdk.detail.actionCards.editToolchain.description') }}
          </span>
        </button>

        <button
          v-if="sdk.actions.canRemove"
          class="flex flex-col items-start gap-1 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-left shadow-sm transition-all hover:scale-[1.02] hover:border-red-500/50 hover:bg-red-500/10"
          @click="removeSdkDialogOpen = true"
        >
          <span class="text-sm font-medium text-red-500">{{ t('sdk.detail.actionCards.remove.title') }}</span>
          <span class="text-xs text-red-500/70 mt-0.5 leading-relaxed">
            {{ t('sdk.detail.actionCards.remove.description') }}
          </span>
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

    <EditToolchainDialog
      :open="editToolchainDialogOpen"
      :initial-source="sdk.toolchainSource"
      :initial-mirror-urls="sdk.toolchainMirrorUrls"
      :initial-tools-path="sdk.toolsPath"
      :busy="taskCenterStore.requestInFlight"
      @close="editToolchainDialogOpen = false"
      @confirm="handleEditToolchainConfirm"
    />

    <RemoveSdkDialog
      :open="removeSdkDialogOpen"
      :sdk-name="sdk.name"
      :busy="taskCenterStore.requestInFlight"
      @close="removeSdkDialogOpen = false"
      @confirm="handleRemoveSdkConfirm"
    />
  </section>

  <section
    v-else
    class="rounded-3xl border border-dashed border-vscode-panel-border px-6 py-12 text-center text-vscode-input-placeholder"
  >
    {{ t('sdk.detail.loading') }}
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import BaseButton from '@/components/common/BaseButton.vue';
import RenameSdkDialog from '@/components/dialogs/RenameSdkDialog.vue';
import SwitchSdkRefDialog from '@/components/dialogs/SwitchSdkRefDialog.vue';
import EditToolchainDialog from '@/components/dialogs/EditToolchainDialog.vue';
import RemoveSdkDialog from '@/components/dialogs/RemoveSdkDialog.vue';
import { postMessage } from '@/services/vscodeBridge';
import { useSdkCatalogStore } from '@/stores/sdkCatalog';
import { useSdkTargetsStore } from '@/stores/sdkTargets';
import { useTaskCenterStore } from '@/stores/taskCenter';
import type { ToolchainMirrorUrls, ToolchainSource, WebviewMessage } from '@/types';
import { TOOLCHAIN_MIRROR_FIELDS, mirrorSourceLabelKey, normalizeMirrorUrls } from '@/utils/toolchainMirror';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const catalogStore = useSdkCatalogStore();
const targetsStore = useSdkTargetsStore();
const taskCenterStore = useTaskCenterStore();

const switchDialogOpen = ref(false);
const renameDialogOpen = ref(false);
const editToolchainDialogOpen = ref(false);
const removeSdkDialogOpen = ref(false);

const sdkId = computed(() => route.params.sdkId as string);
const sdk = computed(() => catalogStore.getSdkDetailById(sdkId.value));
const configuredMirrorUrls = computed(() => {
  const urls = normalizeMirrorUrls(sdk.value?.toolchainMirrorUrls);
  return TOOLCHAIN_MIRROR_FIELDS.map(field => ({
    key: field.key,
    labelKey: field.labelKey,
    value: urls[field.key],
  })).filter(item => !!item.value);
});

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

async function handleEditToolchainConfirm(payload: {
  source: ToolchainSource;
  mirrorUrls?: ToolchainMirrorUrls;
  toolsPath: string;
}) {
  editToolchainDialogOpen.value = false;
  await requestTask({
    command: 'editToolchain',
    data: {
      sdkId: sdkId.value,
      source: payload.source,
      toolchainMirrorUrls: payload.mirrorUrls,
      toolsPath: payload.toolsPath,
    },
  });
}

async function handleRemoveSdkConfirm() {
  removeSdkDialogOpen.value = false;
  try {
    const taskId = await taskCenterStore.requestTask({
      command: 'removeSdk',
      data: {
        sdkId: sdkId.value,
      },
    });

    // Fire and forget redirect back to overview,
    // as the current detail route will be invalid very soon
    await router.push(`/tasks/${taskId}`);
  } catch (error) {
    catalogStore.setBanner(error instanceof Error ? error.message : String(error), 'error');
  }
}
</script>
