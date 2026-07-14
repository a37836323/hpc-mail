<template>
  <header class="topbar">
    <div class="topbar__leading">
      <IconButton :label="$t('toggleNavigation')" @click="toggleNavigation"><Menu :size="21" aria-hidden="true" /></IconButton>
      <div class="page-heading">
        <span class="page-heading__eyebrow">{{ settingStore.settings.title }}</span>
        <h1 class="page-heading__title">{{ $t(route.meta.title || 'inbox') }}</h1>
      </div>
    </div>

    <div class="topbar__actions">
      <AppButton v-perm="'email:send'" class="compose-action" size="sm" @click="openSend">
        <template #icon><SquarePen :size="18" aria-hidden="true" /></template>
        <span class="compose-action__label">{{ $t('compose') }}</span>
      </AppButton>
      <IconButton :label="$t('noticeTitle')" @click="uiStore.showNotice()"><Bell :size="20" aria-hidden="true" /></IconButton>
      <IconButton :label="uiStore.dark ? $t('useLightTheme') : $t('useDarkTheme')" @click="toggleTheme">
        <Sun v-if="uiStore.dark" :size="20" aria-hidden="true" />
        <Moon v-else :size="20" aria-hidden="true" />
      </IconButton>

      <DropdownMenuRoot>
        <DropdownMenuTrigger class="profile-trigger" :aria-label="$t('openAccountMenu')">
          <span class="profile-trigger__avatar">{{ avatarLetter }}</span>
          <span class="profile-trigger__identity">
            <strong>{{ identity }}</strong>
            <small>{{ userStore.user?.role?.name || $t('profile') }}</small>
          </span>
          <ChevronDown :size="16" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="profile-menu" :side-offset="8" align="end">
            <div class="profile-menu__summary">
              <span class="profile-menu__avatar">{{ avatarLetter }}</span>
              <div>
                <strong>{{ displayName }}</strong>
                <span>{{ identity }}</span>
              </div>
            </div>
            <div class="usage-grid">
              <div><span>{{ $t('sendCount') }}</span><strong>{{ sendCount || sendType }}</strong></div>
              <div><span>{{ $t('accountCount') }}</span><strong>{{ accountCountLabel }}</strong></div>
            </div>
            <DropdownMenuSeparator class="menu-separator" />
            <DropdownMenuItem class="menu-item" @select="setLanguage(settingStore.lang === 'zh' ? 'en' : 'zh')">
              <Languages :size="18" aria-hidden="true" />
              {{ settingStore.lang === 'zh' ? 'English' : '简体中文' }}
            </DropdownMenuItem>
            <DropdownMenuItem class="menu-item menu-item--danger" :disabled="logoutLoading" @select="clickLogout">
              <LogOut :size="18" aria-hidden="true" />
              {{ logoutLoading ? $t('signingOut') : $t('logOut') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
  </header>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Bell, ChevronDown, Languages, LogOut, Menu, Moon, SquarePen, Sun } from '@lucide/vue'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from 'reka-ui'
import AppButton from '@/components/ui/AppButton.vue'
import IconButton from '@/components/ui/IconButton.vue'
import router from '@/router'
import { logout } from '@/request/login.js'
import { useUiStore } from '@/store/ui.js'
import { useUserStore } from '@/store/user.js'
import { useSettingStore } from '@/store/setting.js'
import { hasPerm } from '@/perm/perm.js'
import { useI18n } from 'vue-i18n'
import { setExtend } from '@/utils/day.js'
import { resolveDisplayName, resolveUsername } from '@/utils/user-identity.js'

const { t, locale } = useI18n()
const route = useRoute()
const settingStore = useSettingStore()
const userStore = useUserStore()
const uiStore = useUiStore()
const logoutLoading = ref(false)

const identity = computed(() => resolveUsername(userStore.user) || t('profile'))
const displayName = computed(() => resolveDisplayName(userStore.user) || identity.value)
const avatarLetter = computed(() => Array.from(displayName.value || '?')[0]?.toUpperCase() || '?')
const accountCount = computed(() => userStore.user?.role?.accountCount)
const accountCountLabel = computed(() => {
  if (settingStore.settings.manyEmail || settingStore.settings.addEmail) return t('disabled')
  if (!hasPerm('account:add')) return t('unauthorized')
  return accountCount.value ? t('totalUserAccount', { msg: accountCount.value }) : t('unlimited')
})
const sendType = computed(() => {
  if (settingStore.settings.send === 1) return t('disabled')
  if (!hasPerm('email:send')) return t('unauthorized')
  const role = userStore.user?.role || {}
  if (role.sendType === 'ban') return t('sendBanned')
  if (role.sendType === 'internal') return t('sendInternal')
  if (!role.sendCount) return t('unlimited')
  return role.sendType === 'day' ? t('daily') : t('total')
})
const sendCount = computed(() => {
  const role = userStore.user?.role || {}
  if (!hasPerm('email:send') || !role.sendCount || ['ban', 'internal'].includes(role.sendType) || settingStore.settings.send === 1) return ''
  return `${userStore.user?.sendCount || 0}/${role.sendCount}`
})

function toggleNavigation() { uiStore.asideShow = !uiStore.asideShow }
function openSend() { uiStore.writerRef?.open?.() }
function toggleTheme() {
  uiStore.dark = !uiStore.dark
  document.documentElement.classList.toggle('dark', uiStore.dark)
  const meta = document.getElementById('theme-color-meta')
  meta?.setAttribute('content', uiStore.dark ? '#121826' : '#F7F9FC')
}
function setLanguage(lang) {
  setExtend(lang === 'en' ? 'en' : 'zh-cn')
  settingStore.lang = lang
  locale.value = lang
}
async function clickLogout() {
  if (logoutLoading.value) return
  logoutLoading.value = true
  try { await logout() } finally {
    localStorage.removeItem('token')
    logoutLoading.value = false
    await router.replace('/login')
  }
}
</script>

<style scoped>
.topbar { min-width: 0; height: 64px; padding-inline: 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-block-end: 1px solid var(--border); background: var(--surface); z-index: var(--z-sticky); }
.topbar__leading, .topbar__actions { min-width: 0; display: flex; align-items: center; }
.topbar__leading { gap: 4px; }
.topbar__actions { gap: 4px; }
.page-heading { min-width: 0; display: grid; }
.page-heading__eyebrow { color: var(--subtle-foreground); font-size: .6875rem; line-height: 1.2; }
.page-heading__title { overflow: hidden; color: var(--foreground); font-size: .9375rem; line-height: 1.35; font-weight: 720; text-overflow: ellipsis; white-space: nowrap; }
.profile-trigger { min-height: 44px; margin-inline-start: 4px; padding: 4px 7px 4px 4px; display: flex; align-items: center; gap: 8px; border: 1px solid transparent; border-radius: var(--radius-control); color: var(--foreground); background: transparent; cursor: pointer; }
.profile-trigger:hover, .profile-trigger[data-state='open'] { border-color: var(--border); background: var(--surface-subtle); }
.profile-trigger__avatar, .profile-menu__avatar { display: inline-flex; align-items: center; justify-content: center; color: var(--primary); background: var(--primary-soft); font-weight: 750; }
.profile-trigger__avatar { width: 34px; height: 34px; border-radius: 9px; }
.profile-trigger__identity { max-width: 140px; display: grid; text-align: start; }
.profile-trigger__identity strong, .profile-trigger__identity small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile-trigger__identity strong { font-size: .8125rem; }
.profile-trigger__identity small { color: var(--muted-foreground); font-size: .6875rem; }
.profile-menu { z-index: var(--z-dropdown); width: min(288px, calc(100vw - 24px)); padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--surface-raised); box-shadow: var(--shadow-floating); transform-origin: var(--reka-dropdown-menu-content-transform-origin); animation: menu-in var(--motion-base) var(--ease-out); }
.profile-menu__summary { padding: 10px; display: flex; align-items: center; gap: 12px; }
.profile-menu__avatar { width: 42px; height: 42px; flex: 0 0 42px; border-radius: 12px; }
.profile-menu__summary div { min-width: 0; display: grid; }
.profile-menu__summary strong, .profile-menu__summary span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile-menu__summary strong { font-size: .9375rem; }
.profile-menu__summary span { color: var(--muted-foreground); font-size: .75rem; }
.usage-grid { margin: 4px; padding: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; border-radius: var(--radius-control); background: var(--surface-subtle); }
.usage-grid div { min-width: 0; display: grid; gap: 3px; }
.usage-grid span { color: var(--muted-foreground); font-size: .6875rem; }
.usage-grid strong { overflow: hidden; font-size: .8125rem; text-overflow: ellipsis; white-space: nowrap; }
.menu-separator { height: 1px; margin: 7px 4px; background: var(--border); }
.menu-item { min-height: 42px; padding-inline: 10px; display: flex; align-items: center; gap: 10px; border-radius: var(--radius-sm); color: var(--foreground); font-size: .875rem; cursor: pointer; user-select: none; }
.menu-item[data-highlighted] { background: var(--surface-subtle); outline: none; }
.menu-item--danger { color: var(--destructive); }
@keyframes menu-in { from { opacity: 0; transform: translateY(-4px) scale(.98); } }

@media (max-width: 767px) {
  .topbar { height: calc(56px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) 8px 0 4px; }
  .page-heading__eyebrow, .profile-trigger__identity, .profile-trigger > svg, .topbar__actions > :nth-child(2) { display: none; }
  .compose-action { width: 44px; padding-inline: 0; }
  .compose-action__label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
}
</style>
