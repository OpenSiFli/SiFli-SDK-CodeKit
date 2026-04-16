import type { Pinia } from 'pinia';
import { setActivePinia } from 'pinia';
import { useSdkCatalogStore } from './sdkCatalog';
import { useSdkTargetsStore } from './sdkTargets';
import { useTaskCenterStore } from './taskCenter';
import { useDebugSnapshotStore } from './debugSnapshot';

export function initializeStores(pinia: Pinia) {
  setActivePinia(pinia);
  useSdkCatalogStore().initializeMessaging();
  useSdkTargetsStore().initializeMessaging();
  useTaskCenterStore().initializeMessaging();
  useDebugSnapshotStore().initializeMessaging();
}
