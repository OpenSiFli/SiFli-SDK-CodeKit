<template>
  <AppShell>
    <RouterView />
  </AppShell>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppShell from '@/components/layout/AppShell.vue';
import { useDebugSnapshotStore } from '@/stores/debugSnapshot';
import { useKconfigStore } from '@/stores/kconfig';
import { useSdkCatalogStore } from '@/stores/sdkCatalog';
import { useSdkTargetsStore } from '@/stores/sdkTargets';
import { useTaskCenterStore } from '@/stores/taskCenter';

useSdkCatalogStore().initializeMessaging();
useSdkTargetsStore().initializeMessaging();
useTaskCenterStore().initializeMessaging();
useDebugSnapshotStore().initializeMessaging();
useKconfigStore().initializeMessaging();
</script>
