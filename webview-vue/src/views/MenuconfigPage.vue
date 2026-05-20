<template>
  <section class="flex min-h-[calc(100vh-2rem)] flex-col gap-3">
    <header class="border-b border-vscode-panel-border pb-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs uppercase text-vscode-input-placeholder">Menuconfig</p>
          <h2 class="mt-1 text-2xl font-semibold leading-tight">图形化配置</h2>
          <div v-if="snapshot" class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-vscode-input-placeholder">
            <span>Board: {{ snapshot.boardName }}</span>
            <span class="min-w-0 truncate">Config: {{ compactPath(snapshot.configFile) }}</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <BaseButton
            variant="secondary"
            size="sm"
            :disabled="store.loading || store.saving"
            @click="store.fetchSnapshot()"
          >
            刷新
          </BaseButton>
          <BaseButton
            variant="secondary"
            size="sm"
            :disabled="!store.dirty || store.saving"
            @click="store.discardChanges()"
          >
            丢弃
          </BaseButton>
          <BaseButton
            variant="primary"
            size="sm"
            :disabled="!store.dirty || store.saving"
            :loading="store.saving"
            @click="store.saveChanges()"
          >
            保存
          </BaseButton>
          <BaseButton variant="warning" size="sm" :disabled="store.saving" @click="store.openTerminalMenuconfig()">
            终端版
          </BaseButton>
        </div>
      </div>
    </header>

    <div v-if="store.error" class="border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
      {{ store.error }}
    </div>

    <div
      v-if="store.loading && !snapshot"
      class="flex flex-1 items-center justify-center text-vscode-input-placeholder"
    >
      正在读取 Kconfig...
    </div>

    <div v-else class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
      <aside class="min-h-0 border border-vscode-panel-border bg-vscode-background">
        <div class="border-b border-vscode-panel-border p-3">
          <input
            v-model.trim="query"
            class="w-full border border-vscode-input-border bg-vscode-input-background px-3 py-2 text-sm text-vscode-input-foreground outline-none"
            placeholder="搜索配置项"
          />
        </div>
        <div class="max-h-[calc(100vh-9rem)] overflow-auto py-2">
          <button
            v-for="node in menuNodes"
            :key="node.id"
            class="block w-full truncate px-2 py-1.5 text-left text-sm hover:bg-[var(--vscode-list-hoverBackground)]"
            :class="
              node.id === selectedNodeId
                ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                : ''
            "
            :style="{ paddingLeft: `${node.depth * 12 + 8}px` }"
            @click="selectNode(node.id)"
          >
            {{ node.prompt }}
          </button>
        </div>
      </aside>

      <main class="min-h-0 overflow-auto border border-vscode-panel-border bg-vscode-background">
        <div class="sticky top-0 z-10 border-b border-vscode-panel-border bg-vscode-background px-4 py-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-base font-semibold leading-tight">{{ contentTitle }}</h3>
            <span class="text-xs text-vscode-input-placeholder">
              {{ store.changedCount }} 项更改
              <span v-if="store.previewing"> · 正在计算依赖</span>
            </span>
          </div>
        </div>

        <div v-if="contentNodes.length === 0" class="px-4 py-12 text-center text-vscode-input-placeholder">
          没有匹配的配置项
        </div>

        <div v-else class="divide-y divide-vscode-panel-border">
          <article
            v-for="node in contentNodes"
            :key="node.id"
            class="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_260px]"
            :class="node.visible ? '' : 'opacity-55'"
            @click="selectedDetailId = node.id"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <button class="truncate text-left font-medium hover:underline" @click.stop="selectedDetailId = node.id">
                  {{ node.prompt }}
                </button>
                <span v-if="node.symbol" class="font-mono text-xs text-vscode-input-placeholder">{{
                  node.symbol
                }}</span>
                <span v-if="!node.editable && isConfigurable(node)" class="text-xs text-vscode-input-placeholder">
                  只读
                </span>
              </div>
              <p v-if="node.dependsOn" class="mt-1 truncate text-xs text-vscode-input-placeholder">
                depends on {{ node.dependsOn }}
              </p>
            </div>

            <div class="flex items-center justify-end">
              <template v-if="node.kind === 'choice'">
                <select
                  class="w-full border border-vscode-input-border bg-vscode-input-background px-2 py-1.5 text-sm"
                  :value="node.value"
                  :disabled="!node.editable || store.saving"
                  @change="handleChoiceSelect($event)"
                >
                  <option v-for="child in choiceOptions(node)" :key="child.symbol" :value="child.symbol">
                    {{ child.prompt }}
                  </option>
                </select>
              </template>

              <template v-else-if="isBool(node)">
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    :checked="nodeValue(node) === 'y'"
                    :disabled="!node.editable || store.saving"
                    @change="handleBoolChange(node, $event)"
                  />
                  <span>{{ nodeValue(node) === 'y' ? '启用' : '关闭' }}</span>
                </label>
              </template>

              <template v-else-if="isTristate(node)">
                <select
                  class="w-full border border-vscode-input-border bg-vscode-input-background px-2 py-1.5 text-sm"
                  :value="nodeValue(node)"
                  :disabled="!node.editable || store.saving"
                  @change="handleSelectChange(node, $event)"
                >
                  <option v-for="value in node.assignable" :key="value" :value="value">{{ value }}</option>
                </select>
              </template>

              <template v-else-if="isTextValue(node)">
                <input
                  class="w-full border border-vscode-input-border bg-vscode-input-background px-2 py-1.5 text-sm"
                  :value="nodeValue(node)"
                  :disabled="!node.editable || store.saving"
                  @change="handleTextChange(node, $event)"
                />
              </template>

              <span v-else class="text-sm text-vscode-input-placeholder">{{ node.value }}</span>
            </div>
          </article>
        </div>
      </main>

      <aside class="min-h-0 overflow-auto border border-vscode-panel-border bg-vscode-background">
        <div class="border-b border-vscode-panel-border px-4 py-3">
          <h3 class="text-base font-semibold leading-tight">详情</h3>
        </div>
        <div v-if="selectedDetail" class="space-y-3 p-4 text-sm">
          <div>
            <p class="text-xs uppercase text-vscode-input-placeholder">Name</p>
            <p class="mt-1 font-medium">{{ selectedDetail.prompt }}</p>
            <p v-if="selectedDetail.symbol" class="mt-1 font-mono text-xs text-vscode-input-placeholder">
              {{ selectedDetail.symbol }}
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p class="text-vscode-input-placeholder">Type</p>
              <p>{{ selectedDetail.type }}</p>
            </div>
            <div>
              <p class="text-vscode-input-placeholder">Value</p>
              <p>{{ selectedDetail.value || '-' }}</p>
            </div>
          </div>
          <div v-if="selectedDetail.location">
            <p class="text-xs uppercase text-vscode-input-placeholder">Location</p>
            <p class="mt-1 break-all font-mono text-xs">{{ selectedDetail.location }}</p>
          </div>
          <div v-if="selectedDetail.dependsOn">
            <p class="text-xs uppercase text-vscode-input-placeholder">Depends</p>
            <p class="mt-1 break-words font-mono text-xs">{{ selectedDetail.dependsOn }}</p>
          </div>
          <div v-if="selectedDetail.help">
            <p class="text-xs uppercase text-vscode-input-placeholder">Help</p>
            <p class="mt-1 whitespace-pre-wrap leading-relaxed">{{ selectedDetail.help }}</p>
          </div>
        </div>
        <div v-else class="p-4 text-sm text-vscode-input-placeholder">选择一个配置项查看详情</div>

        <div v-if="snapshot?.warnings.length" class="border-t border-vscode-panel-border p-4">
          <p class="text-xs uppercase text-vscode-input-placeholder">Warnings</p>
          <ul class="mt-2 space-y-2 text-xs text-amber-100">
            <li v-for="warning in snapshot.warnings" :key="warning">{{ warning }}</li>
          </ul>
        </div>

        <div v-if="store.logs.length" class="border-t border-vscode-panel-border p-4">
          <p class="text-xs uppercase text-vscode-input-placeholder">Task</p>
          <ul class="mt-2 space-y-1 text-xs">
            <li
              v-for="log in store.logs"
              :key="`${log.ts}-${log.message}`"
              :class="log.level === 'error' ? 'text-red-200' : ''"
            >
              {{ log.message }}
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import BaseButton from '@/components/common/BaseButton.vue';
import { useKconfigStore } from '@/stores/kconfig';
import type { KconfigNode } from '@/types';

const store = useKconfigStore();
const query = ref('');
const selectedNodeId = ref('');
const selectedDetailId = ref('');

const snapshot = computed(() => store.snapshot);

const menuNodes = computed(() =>
  store.flatNodes.filter(node => node.kind === 'menu' || node.kind === 'choice' || node.children.length > 0)
);

const selectedNode = computed(() => store.flatNodes.find(node => node.id === selectedNodeId.value) ?? null);
const selectedDetail = computed(
  () => store.flatNodes.find(node => node.id === selectedDetailId.value) ?? selectedNode.value
);

const contentTitle = computed(() => {
  if (query.value) {
    return '搜索结果';
  }
  return selectedNode.value?.prompt ?? '全部配置';
});

const contentNodes = computed<KconfigNode[]>(() => {
  const needle = query.value.trim().toLowerCase();
  if (needle) {
    return store.flatNodes.filter(
      node =>
        isConfigurable(node) &&
        (node.prompt.toLowerCase().includes(needle) || node.symbol.toLowerCase().includes(needle))
    );
  }
  if (selectedNode.value) {
    return selectedNode.value.children;
  }
  return snapshot.value?.nodes ?? [];
});

onMounted(() => {
  store.fetchSnapshot();
});

watch(
  () => snapshot.value?.nodes,
  nodes => {
    if (!nodes || nodes.length === 0) {
      return;
    }
    if (!selectedNodeId.value) {
      selectedNodeId.value = menuNodes.value[0]?.id ?? nodes[0].id;
    }
    if (!selectedDetailId.value) {
      selectedDetailId.value = nodes[0].id;
    }
  },
  { immediate: true }
);

function selectNode(id: string) {
  selectedNodeId.value = id;
  selectedDetailId.value = id;
}

function isConfigurable(node: KconfigNode): boolean {
  return !!node.symbol || node.kind === 'choice';
}

function isBool(node: KconfigNode): boolean {
  return (node.kind === 'symbol' || node.kind === 'choice-item') && node.type === 'bool';
}

function isTristate(node: KconfigNode): boolean {
  return (node.kind === 'symbol' || node.kind === 'choice-item') && node.type === 'tristate';
}

function isTextValue(node: KconfigNode): boolean {
  return (node.kind === 'symbol' || node.kind === 'choice-item') && ['string', 'int', 'hex'].includes(node.type);
}

function nodeValue(node: KconfigNode): string {
  return node.symbol ? (store.changes[node.symbol] ?? node.value) : node.value;
}

function choiceOptions(node: KconfigNode): KconfigNode[] {
  return node.children.filter(child => child.symbol && child.visible);
}

function handleBoolChange(node: KconfigNode, event: Event) {
  store.setChange(node.symbol, (event.target as HTMLInputElement).checked ? 'y' : 'n');
}

function handleSelectChange(node: KconfigNode, event: Event) {
  store.setChange(node.symbol, (event.target as HTMLSelectElement).value);
}

function handleTextChange(node: KconfigNode, event: Event) {
  store.setChange(node.symbol, (event.target as HTMLInputElement).value);
}

function handleChoiceSelect(event: Event) {
  const symbol = (event.target as HTMLSelectElement).value;
  if (symbol) {
    store.setChange(symbol, 'y');
  }
}

function compactPath(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts.length > 3 ? `.../${parts.slice(-3).join('/')}` : filePath;
}
</script>
