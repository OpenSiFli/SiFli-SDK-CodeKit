<template>
  <section class="flex min-h-[calc(100vh-2rem)] flex-col gap-3">
    <header class="border-b border-vscode-panel-border pb-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs uppercase text-vscode-input-placeholder">{{ t('menuconfig.sectionLabel') }}</p>
          <h2 class="mt-1 text-2xl font-semibold leading-tight">{{ t('menuconfig.title') }}</h2>
          <div v-if="snapshot" class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-vscode-input-placeholder">
            <span>{{ t('menuconfig.meta.board', { board: snapshot.boardName }) }}</span>
            <span class="min-w-0 truncate">{{
              t('menuconfig.meta.config', { config: compactPath(snapshot.configFile) })
            }}</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <BaseButton
            variant="secondary"
            size="sm"
            :disabled="store.loading || store.saving"
            @click="store.fetchSnapshot()"
          >
            {{ t('menuconfig.actions.refresh') }}
          </BaseButton>
          <BaseButton
            variant="secondary"
            size="sm"
            :disabled="!store.dirty || store.saving"
            @click="store.discardChanges()"
          >
            {{ t('menuconfig.actions.discard') }}
          </BaseButton>
          <BaseButton
            variant="primary"
            size="sm"
            :disabled="!store.dirty || store.saving"
            :loading="store.saving"
            @click="store.saveChanges()"
          >
            {{ t('menuconfig.actions.save') }}
          </BaseButton>
          <BaseButton variant="warning" size="sm" :disabled="store.saving" @click="store.openTerminalMenuconfig()">
            {{ t('menuconfig.actions.terminal') }}
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
      {{ t('menuconfig.loading') }}
    </div>

    <div v-else class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
      <aside class="min-h-0 border border-vscode-panel-border bg-vscode-background">
        <div class="border-b border-vscode-panel-border p-3">
          <input
            v-model.trim="query"
            class="w-full border border-vscode-input-border bg-vscode-input-background px-3 py-2 text-sm text-vscode-input-foreground outline-none"
            :placeholder="t('menuconfig.search.placeholder')"
          />
        </div>
        <div class="max-h-[calc(100vh-9rem)] overflow-auto py-2">
          <div v-if="treeRows.length === 0" class="px-3 py-8 text-center text-sm text-vscode-input-placeholder">
            {{ t('menuconfig.empty.noMenuMatches') }}
          </div>
          <template v-else>
            <div
              v-for="row in treeRows"
              :key="row.node.id"
              class="flex min-w-0 items-center gap-1 px-2 py-1 text-sm hover:bg-[var(--vscode-list-hoverBackground)]"
              :class="
                row.node.id === selectedNodeId
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                  : ''
              "
              :style="{ paddingLeft: `${row.depth * 12 + 8}px` }"
            >
              <button
                v-if="row.hasChildren"
                class="flex h-5 w-5 shrink-0 items-center justify-center text-xs text-vscode-input-placeholder hover:text-vscode-foreground"
                :aria-label="
                  isExpanded(row.node) ? t('menuconfig.tree.collapseLabel') : t('menuconfig.tree.expandLabel')
                "
                @click.stop="toggleNode(row.node.id)"
              >
                {{ isExpanded(row.node) ? '▾' : '▸' }}
              </button>
              <span v-else class="h-5 w-5 shrink-0" />
              <button
                class="min-w-0 flex-1 truncate text-left"
                :class="row.matched ? 'font-medium text-vscode-foreground' : ''"
                @click="selectNode(row.node.id)"
              >
                {{ row.node.prompt }}
              </button>
            </div>
          </template>
        </div>
      </aside>

      <main class="min-h-0 overflow-auto border border-vscode-panel-border bg-vscode-background">
        <div class="sticky top-0 z-10 border-b border-vscode-panel-border bg-vscode-background px-4 py-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-base font-semibold leading-tight">{{ contentTitle }}</h3>
            <span class="text-xs text-vscode-input-placeholder">
              {{ t('menuconfig.changes.count', { count: store.changedCount }) }}
              <span v-if="store.previewing"> · {{ t('menuconfig.changes.previewing') }}</span>
            </span>
          </div>
        </div>

        <div v-if="contentNodes.length === 0" class="px-4 py-12 text-center text-vscode-input-placeholder">
          {{ t('menuconfig.empty.noConfigMatches') }}
        </div>

        <div v-else class="divide-y divide-vscode-panel-border">
          <article
            v-for="node in contentNodes"
            :key="node.id"
            class="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_260px]"
            :class="node.visible ? '' : 'opacity-55'"
            @click="showDetail(node.id)"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <button class="truncate text-left font-medium hover:underline" @click.stop="showDetail(node.id)">
                  {{ node.prompt }}
                </button>
                <span v-if="node.symbol" class="font-mono text-xs text-vscode-input-placeholder">{{
                  node.symbol
                }}</span>
                <span v-if="!node.editable && isConfigurable(node)" class="text-xs text-vscode-input-placeholder">
                  {{ t('menuconfig.fields.readOnly') }}
                </span>
              </div>
              <p v-if="node.dependsOn" class="mt-1 truncate text-xs text-vscode-input-placeholder">
                {{ t('menuconfig.fields.dependsOn', { expression: node.dependsOn }) }}
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
                  <span>{{
                    nodeValue(node) === 'y' ? t('menuconfig.values.enabled') : t('menuconfig.values.disabled')
                  }}</span>
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
          <h3 class="text-base font-semibold leading-tight">{{ t('menuconfig.details.title') }}</h3>
        </div>
        <div v-if="selectedDetail" class="space-y-3 p-4 text-sm">
          <div>
            <p class="text-xs uppercase text-vscode-input-placeholder">{{ t('menuconfig.details.name') }}</p>
            <p class="mt-1 font-medium">{{ selectedDetail.prompt }}</p>
            <p v-if="selectedDetail.symbol" class="mt-1 font-mono text-xs text-vscode-input-placeholder">
              {{ selectedDetail.symbol }}
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p class="text-vscode-input-placeholder">{{ t('menuconfig.details.type') }}</p>
              <p>{{ selectedDetail.type }}</p>
            </div>
            <div>
              <p class="text-vscode-input-placeholder">{{ t('menuconfig.details.value') }}</p>
              <p>{{ selectedDetail.value || '-' }}</p>
            </div>
          </div>
          <div v-if="selectedDetail.location">
            <p class="text-xs uppercase text-vscode-input-placeholder">{{ t('menuconfig.details.location') }}</p>
            <p class="mt-1 break-all font-mono text-xs">{{ selectedDetail.location }}</p>
          </div>
          <div v-if="selectedDetail.dependsOn">
            <p class="text-xs uppercase text-vscode-input-placeholder">{{ t('menuconfig.details.depends') }}</p>
            <p class="mt-1 break-words font-mono text-xs">{{ selectedDetail.dependsOn }}</p>
          </div>
          <div v-if="selectedDetail.help">
            <p class="text-xs uppercase text-vscode-input-placeholder">{{ t('menuconfig.details.help') }}</p>
            <p class="mt-1 whitespace-pre-wrap leading-relaxed">{{ selectedDetail.help }}</p>
          </div>
        </div>
        <div v-else class="p-4 text-sm text-vscode-input-placeholder">
          {{ t('menuconfig.details.placeholder') }}
        </div>

        <div v-if="snapshot?.warnings.length" class="border-t border-vscode-panel-border p-4">
          <p class="text-xs uppercase text-vscode-input-placeholder">{{ t('menuconfig.warnings.title') }}</p>
          <ul class="mt-2 space-y-2 text-xs text-amber-100">
            <li v-for="warning in snapshot.warnings" :key="warning">{{ warning }}</li>
          </ul>
        </div>

        <div v-if="store.logs.length" class="border-t border-vscode-panel-border p-4">
          <p class="text-xs uppercase text-vscode-input-placeholder">{{ t('menuconfig.task.title') }}</p>
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
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/common/BaseButton.vue';
import { useKconfigStore } from '@/stores/kconfig';
import type { KconfigNode } from '@/types';

interface TreeRow {
  node: KconfigNode;
  depth: number;
  hasChildren: boolean;
  matched: boolean;
}

const store = useKconfigStore();
const query = ref('');
const selectedNodeId = ref('');
const selectedDetailId = ref('');
const expandedNodeIds = ref<Set<string>>(new Set());
const { t } = useI18n();

const snapshot = computed(() => store.snapshot);
const searchNeedle = computed(() => query.value.trim().toLowerCase());

const treeRows = computed(() => {
  const nodes = snapshot.value?.nodes ?? [];
  return searchNeedle.value ? buildFilteredTreeRows(nodes, 0, searchNeedle.value) : buildExpandedTreeRows(nodes, 0);
});

const selectedNode = computed(() => store.flatNodes.find(node => node.id === selectedNodeId.value) ?? null);
const selectedDetail = computed(
  () => store.flatNodes.find(node => node.id === selectedDetailId.value) ?? selectedNode.value
);

const contentTitle = computed(() => {
  if (query.value) {
    return t('menuconfig.search.results');
  }
  return selectedNode.value?.prompt ?? t('menuconfig.search.allConfig');
});

const contentNodes = computed<KconfigNode[]>(() => {
  if (searchNeedle.value) {
    return store.flatNodes.filter(node => isConfigurable(node) && matchesNode(node, searchNeedle.value));
  }
  if (selectedNode.value) {
    return selectedNode.value.children.length > 0 ? selectedNode.value.children : [selectedNode.value];
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
    if (expandedNodeIds.value.size === 0) {
      expandedNodeIds.value = new Set(collectInitialExpandedIds(nodes));
    }
    if (!selectedNodeId.value) {
      selectedNodeId.value = treeRows.value[0]?.node.id ?? nodes[0].id;
    }
    if (!selectedDetailId.value) {
      selectedDetailId.value = nodes[0].id;
    }
  },
  { immediate: true }
);

watch(searchNeedle, needle => {
  if (!needle) {
    return;
  }
  const firstMatch = store.flatNodes.find(node => isConfigurable(node) && matchesNode(node, needle));
  if (firstMatch) {
    selectedNodeId.value = firstMatch.id;
    selectedDetailId.value = firstMatch.id;
  }
});

function selectNode(id: string) {
  selectedNodeId.value = id;
  selectedDetailId.value = id;
  expandAncestors(id);
}

function showDetail(id: string) {
  selectedDetailId.value = id;
  expandAncestors(id);
}

function toggleNode(id: string) {
  if (searchNeedle.value) {
    return;
  }
  const next = new Set(expandedNodeIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expandedNodeIds.value = next;
}

function isExpanded(node: KconfigNode): boolean {
  return searchNeedle.value ? hasTreeChildren(node) : expandedNodeIds.value.has(node.id);
}

function buildExpandedTreeRows(nodes: KconfigNode[], depth: number): TreeRow[] {
  const rows: TreeRow[] = [];
  for (const node of nodes) {
    if (!isTreeNode(node)) {
      rows.push(...buildExpandedTreeRows(node.children, depth));
      continue;
    }

    const hasChildren = hasTreeChildren(node);
    rows.push({
      node,
      depth,
      hasChildren,
      matched: false,
    });

    if (hasChildren && expandedNodeIds.value.has(node.id)) {
      rows.push(...buildExpandedTreeRows(node.children, depth + 1));
    }
  }
  return rows;
}

function buildFilteredTreeRows(nodes: KconfigNode[], depth: number, needle: string): TreeRow[] {
  const rows: TreeRow[] = [];
  for (const node of nodes) {
    const childRows = buildFilteredTreeRows(node.children, depth + (isTreeNode(node) ? 1 : 0), needle);

    if (!isTreeNode(node)) {
      rows.push(...childRows);
      continue;
    }

    const matched = matchesNode(node, needle);
    if (!matched && childRows.length === 0) {
      continue;
    }

    rows.push({
      node,
      depth,
      hasChildren: hasTreeChildren(node),
      matched,
    });
    rows.push(...childRows);
  }
  return rows;
}

function collectInitialExpandedIds(nodes: KconfigNode[], depth = 0): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (!isTreeNode(node)) {
      ids.push(...collectInitialExpandedIds(node.children, depth));
      continue;
    }
    if (hasTreeChildren(node) && depth < 2) {
      ids.push(node.id);
      ids.push(...collectInitialExpandedIds(node.children, depth + 1));
    }
  }
  return ids;
}

function expandAncestors(id: string) {
  const path = findNodePath(snapshot.value?.nodes ?? [], id);
  if (!path || path.length < 2) {
    return;
  }
  const next = new Set(expandedNodeIds.value);
  for (const ancestorId of path.slice(0, -1)) {
    next.add(ancestorId);
  }
  expandedNodeIds.value = next;
}

function findNodePath(nodes: KconfigNode[], id: string, path: string[] = []): string[] | null {
  for (const node of nodes) {
    const nextPath = isTreeNode(node) ? [...path, node.id] : path;
    if (node.id === id) {
      return nextPath;
    }
    const childPath = findNodePath(node.children, id, nextPath);
    if (childPath) {
      return childPath;
    }
  }
  return null;
}

function isTreeNode(node: KconfigNode): boolean {
  return node.kind !== 'comment' && !!node.prompt;
}

function hasTreeChildren(node: KconfigNode): boolean {
  return node.children.some(child => isTreeNode(child) || hasTreeChildren(child));
}

function matchesNode(node: KconfigNode, needle: string): boolean {
  return node.prompt.toLowerCase().includes(needle) || node.symbol.toLowerCase().includes(needle);
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
