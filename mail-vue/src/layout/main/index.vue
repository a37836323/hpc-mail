<template>
  <div class="main-shell">
    <DialogRoot :open="accountShow" @update:open="updateAccountShow">
      <DialogPortal>
        <DialogOverlay class="mailbox-drawer__overlay" />
        <DialogContent class="mailbox-drawer" aria-describedby="mailbox-drawer-description">
          <DialogTitle class="sr-only">{{ $t('manageMailboxes') }}</DialogTitle>
          <p id="mailbox-drawer-description" class="sr-only">{{ $t('mailboxPanel') }}</p>
          <Account />
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <router-view class="main-view" v-slot="{ Component, route }">
      <keep-alive :include="['email','all-email','send','sys-setting','star','user','role','analysis','reg-key','api-control','draft']">
        <component :is="Component" :key="route.name" />
      </keep-alive>
    </router-view>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import Account from '@/layout/account/index.vue'
import { useUiStore } from '@/store/ui.js'
import { useSettingStore } from '@/store/setting.js'
import { hasPerm } from '@/perm/perm.js'

const settingStore = useSettingStore()
const uiStore = useUiStore()
let elNotification = null

const accountShow = computed(() => (
  uiStore.accountShow
  && settingStore.settings.manyEmail === 0
  && hasPerm('account:query')
))

function updateAccountShow(open) {
  uiStore.accountShow = open
}

watch(() => uiStore.changeNotice, () => showNotice({
  notice: settingStore.settings.notice,
  noticeWidth: settingStore.settings.noticeWidth,
  noticeTitle: settingStore.settings.noticeTitle,
  noticeContent: settingStore.settings.noticeContent,
  noticeType: settingStore.settings.noticeType,
  noticeDuration: settingStore.settings.noticeDuration,
  noticePosition: settingStore.settings.noticePosition,
  noticeOffset: settingStore.settings.noticeOffset,
}))

watch(() => uiStore.changePreview, () => showNotice(uiStore.previewData))

function showNotice(data) {
  if (data.notice === 1) return
  elNotification?.close()

  const style = document.createElement('style')
  style.innerHTML = `.custom-notice.el-notification { --el-notification-width: min(${data.noticeWidth}px, calc(100% - 30px)) !important; }`
  document.head.appendChild(style)

  elNotification = ElNotification({
    title: data.noticeTitle,
    message: `<div style="width:100%;height:100%">${data.noticeContent}</div>`,
    type: data.noticeType === 'none' ? '' : data.noticeType,
    duration: data.noticeDuration,
    position: data.noticePosition,
    offset: data.noticeOffset,
    dangerouslyUseHTMLString: true,
    customClass: 'custom-notice',
  })
}
</script>

<style scoped>
.main-shell { position: relative; height: 100%; overflow: hidden; }
.main-view { width: 100%; height: 100%; background: var(--background); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>

<style>
.mailbox-drawer__overlay { position: fixed; inset: 0; z-index: var(--z-overlay); background: var(--overlay); animation: mailbox-overlay-in var(--motion-base) var(--ease-out); }
.mailbox-drawer { position: fixed; inset-block: 0; inset-inline-end: 0; z-index: var(--z-modal); width: min(340px, calc(100vw - 24px)); padding-block: env(safe-area-inset-top) env(safe-area-inset-bottom); border-inline-start: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-floating); animation: mailbox-drawer-in var(--motion-base) var(--ease-out); }
.mailbox-drawer:focus { outline: none; }
@keyframes mailbox-overlay-in { from { opacity: 0; } }
@keyframes mailbox-drawer-in { from { opacity: 0; transform: translateX(24px); } }
@media (prefers-reduced-motion: reduce) {
  .mailbox-drawer__overlay, .mailbox-drawer { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
</style>
