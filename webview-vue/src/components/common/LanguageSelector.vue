<template>
  <div class="relative">
    <BaseButton
      variant="secondary"
      size="sm"
      @click="isOpen = !isOpen"
      class="flex items-center gap-2 min-w-0"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"></path>
      </svg>
      <span class="hidden sm:inline">{{ getCurrentLanguageName() }}</span>
      <svg class="w-3 h-3 transition-transform duration-200" :class="{ 'rotate-180': isOpen }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
      </svg>
    </BaseButton>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute right-0 top-full mt-2 w-40 bg-vscode-dropdown-background border border-vscode-dropdown-border rounded-md shadow-lg z-50"
      >
        <div class="py-1">
          <button
            v-for="lang in languages"
            :key="lang.code"
            @click="selectLanguage(lang.code)"
            :class="[
              'w-full px-3 py-2 text-left text-sm transition-colors duration-150',
              'hover:bg-vscode-list-hoverBackground',
              'focus:bg-vscode-list-hoverBackground focus:outline-none',
              getCurrentLocale() === lang.code
                ? 'bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground'
                : 'text-vscode-dropdown-foreground'
            ]"
          >
            <div class="flex items-center justify-between">
              <span>{{ lang.name }}</span>
              <svg
                v-if="getCurrentLocale() === lang.code"
                class="w-4 h-4 text-vscode-list-activeSelectionForeground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { getCurrentLocale, setLocale, notifyVSCodeLocaleChange, type SupportedLocale } from '@/i18n';
import BaseButton from './BaseButton.vue';

const isOpen = ref(false);

const languages = [
  { code: 'en' as SupportedLocale, name: 'English' },
  { code: 'zh' as SupportedLocale, name: '中文' },
];

const getCurrentLanguageName = () => {
  const current = getCurrentLocale();
  return languages.find(lang => lang.code === current)?.name || 'English';
};

const selectLanguage = (locale: SupportedLocale) => {
  setLocale(locale);
  // 通知 VS Code 语言变化（可选，用于同步到 VS Code 设置）
  notifyVSCodeLocaleChange(locale);
  isOpen.value = false;
};

// 点击外部关闭下拉菜单
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (!target.closest('.relative')) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>
