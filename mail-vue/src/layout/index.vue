<template>
  <a class="skip-link" href="#main-content">{{ $t('skipToContent') }}</a>
  <div class="app-shell" :class="{ 'app-shell--nav-open': uiStore.asideShow }">
    <aside class="app-sidebar" :aria-label="$t('primaryNavigation')">
      <Aside />
    </aside>
    <button
      v-if="isMobile && uiStore.asideShow"
      type="button"
      class="app-overlay"
      :aria-label="$t('closeNavigation')"
      @click="uiStore.asideShow = false"
    />
    <div class="app-workspace">
      <Header />
      <main id="main-content" class="app-main" tabindex="-1">
        <Main />
      </main>
      <nav class="mobile-nav" :aria-label="$t('mobileNavigation')">
        <RouterLink :to="{ name: 'email' }" class="mobile-nav__item">
          <Inbox :size="21" aria-hidden="true" />
          <span>{{ $t('inbox') }}</span>
        </RouterLink>
        <RouterLink v-if="canSend" :to="{ name: 'send' }" class="mobile-nav__item">
          <Send :size="21" aria-hidden="true" />
          <span>{{ $t('sent') }}</span>
        </RouterLink>
        <RouterLink v-if="canViewAllMail" :to="{ name: 'all-email' }" class="mobile-nav__item">
          <Mails :size="21" aria-hidden="true" />
          <span>{{ $t('allMail') }}</span>
        </RouterLink>
        <RouterLink :to="{ name: 'setting' }" class="mobile-nav__item">
          <Settings :size="21" aria-hidden="true" />
          <span>{{ $t('settings') }}</span>
        </RouterLink>
      </nav>
    </div>
  </div>
  <Writer ref="writerRef" />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Inbox, Mails, Send, Settings } from '@lucide/vue'
import Aside from '@/layout/aside/index.vue'
import Header from '@/layout/header/index.vue'
import Main from '@/layout/main/index.vue'
import Writer from '@/layout/write/index.vue'
import { useUiStore } from '@/store/ui.js'
import { hasPerm } from '@/perm/perm.js'

const uiStore = useUiStore()
const writerRef = ref(null)
const isMobile = ref(window.innerWidth < 768)
const canSend = computed(() => hasPerm('email:send'))
const canViewAllMail = computed(() => hasPerm('all-email:query'))

function handleResize() {
  const wasMobile = isMobile.value
  isMobile.value = window.innerWidth < 768
  if (wasMobile !== isMobile.value || window.innerWidth >= 768) {
    uiStore.asideShow = window.innerWidth >= 768
  }
}

onMounted(() => {
  uiStore.writerRef = writerRef.value
  window.addEventListener('resize', handleResize, { passive: true })
  handleResize()
})

onBeforeUnmount(() => window.removeEventListener('resize', handleResize))
</script>

<style scoped>
.app-shell { position: fixed; inset: 0; display: grid; grid-template-columns: 0 minmax(0, 1fr); overflow: hidden; background: var(--background); }
.app-workspace { min-width: 0; height: 100%; display: grid; grid-template-rows: 64px minmax(0, 1fr); }
.app-main { min-width: 0; min-height: 0; overflow: hidden; background: var(--background); }
.app-sidebar { width: 240px; height: 100%; border-inline-end: 1px solid var(--border); background: var(--surface); transform: translateX(-100%); transition: transform var(--motion-base) var(--ease-out); z-index: var(--z-overlay); }
.app-shell--nav-open { grid-template-columns: 240px minmax(0, 1fr); }
.app-shell--nav-open .app-sidebar { transform: translateX(0); }
.app-overlay { display: none; }
.mobile-nav { display: none; }

@media (min-width: 768px) and (max-width: 1023px) {
  .app-shell, .app-shell--nav-open { grid-template-columns: 76px minmax(0, 1fr); }
  .app-sidebar { width: 76px; transform: translateX(0); }
}

@media (max-width: 767px) {
  .app-shell, .app-shell--nav-open { grid-template-columns: minmax(0, 1fr); }
  .app-workspace { grid-template-rows: calc(56px + env(safe-area-inset-top)) minmax(0, 1fr) calc(64px + env(safe-area-inset-bottom)); }
  .app-sidebar { position: fixed; inset-block: 0; inset-inline-start: 0; width: min(288px, calc(100vw - 48px)); padding-block-start: env(safe-area-inset-top); box-shadow: var(--shadow-floating); }
  .app-overlay { display: block; position: fixed; inset: 0; z-index: calc(var(--z-overlay) - 1); border: 0; background: var(--overlay); }
  .mobile-nav { z-index: var(--z-sticky); min-width: 0; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; align-items: start; padding-block: 5px max(5px, env(safe-area-inset-bottom)); border-block-start: 1px solid var(--border); background: var(--surface); }
  .mobile-nav__item { min-width: 0; min-height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border-radius: var(--radius-sm); color: var(--muted-foreground); font-size: .6875rem; line-height: 1.2; text-decoration: none; }
  .mobile-nav__item.router-link-active { color: var(--primary); background: var(--primary-soft); font-weight: 680; }
}
</style>
