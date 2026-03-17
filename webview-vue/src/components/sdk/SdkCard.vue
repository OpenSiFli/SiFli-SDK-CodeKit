<template>
  <article
    class="rounded-3xl border p-4 shadow-sm cursor-pointer transition-transform hover:scale-[1.01] block w-full text-left sdk-card"
    :class="sdk.isCurrent ? 'sdk-card--active' : 'border-vscode-panel-border bg-vscode-background'"
    @click="$emit('view')"
  >
    <div class="flex flex-col gap-3">
      <div class="flex items-start justify-between gap-2.5">
        <div>
          <div class="flex flex-wrap items-center gap-1.5">
            <h3 class="text-lg font-semibold leading-tight">{{ sdk.name }}</h3>
            <span
              v-if="!sdk.valid"
              class="rounded-full border border-red-500/50 bg-red-500/10 px-2.5 py-1 text-sm uppercase tracking-[0.24em] text-red-200"
            >
              Invalid
            </span>
          </div>
          <p class="mt-0.5 text-base leading-snug text-vscode-input-placeholder">{{ sdk.version }}</p>
        </div>
      </div>

      <dl class="grid gap-2.5 sm:grid-cols-2">
        <div>
          <dt class="text-sm uppercase tracking-[0.2em] text-vscode-input-placeholder">Ref</dt>
          <dd class="mt-0.5 break-all text-base font-medium leading-snug">{{ sdk.ref }}</dd>
        </div>
        <div>
          <dt class="text-sm uppercase tracking-[0.2em] text-vscode-input-placeholder">Hash</dt>
          <dd class="mt-0.5 break-all text-base font-medium leading-snug">{{ sdk.hash || 'N/A' }}</dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-sm uppercase tracking-[0.2em] text-vscode-input-placeholder">Path</dt>
          <dd class="mt-0.5 break-all text-base leading-snug text-vscode-foreground">{{ sdk.path }}</dd>
        </div>
        <div>
          <dt class="text-base uppercase tracking-[0.2em] text-vscode-input-placeholder">工具链</dt>
          <dd class="mt-0.5 break-all text-base leading-snug text-vscode-foreground">
            {{ sdk.toolsPath || '默认环境' }}
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-[0.2em] text-vscode-input-placeholder">状态</dt>
          <dd class="mt-0.5 flex flex-wrap gap-1.5 text-xs leading-tight">
            <span class="rounded-full border border-vscode-panel-border px-2.5 py-1">{{
              sdk.isGitRepo ? sdk.refType : 'non-git'
            }}</span>
            <span
              class="rounded-full px-2.5 py-1"
              :class="
                sdk.isDirty
                  ? 'border border-amber-500/50 bg-amber-500/10 text-amber-100'
                  : 'border border-vscode-panel-border text-vscode-input-placeholder'
              "
            >
              {{ sdk.isDirty ? 'dirty' : 'clean' }}
            </span>
          </dd>
        </div>
      </dl>

      <div v-if="sdk.actions.canActivate && !sdk.isCurrent" class="mt-0.5 flex flex-wrap gap-2">
        <BaseButton variant="primary" size="sm" @click.stop="$emit('activate')"> 设为当前 </BaseButton>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import BaseButton from '@/components/common/BaseButton.vue';
import type { ManagedSdkSummary } from '@/types';

defineProps<{
  sdk: ManagedSdkSummary;
}>();

defineEmits<{
  view: [];
  activate: [];
  'update-branch': [];
  'update-tools': [];
}>();
</script>

<style scoped>
.sdk-card--active {
  background: color-mix(in srgb, var(--vscode-button-background) 12%, transparent);
  border-color: color-mix(in srgb, var(--vscode-button-background) 40%, transparent);
}
</style>
