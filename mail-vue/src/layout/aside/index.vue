<template>
  <div class="sidebar">
    <div class="brand" :title="settingStore.settings.title">
      <span class="brand__mark"><Mail :size="22" aria-hidden="true" /></span>
      <span class="brand__name">{{ settingStore.settings.title }}</span>
    </div>

    <nav class="sidebar__nav">
      <div class="nav-group">
        <RouterLink v-for="item in visiblePrimaryItems" :key="item.name" :to="{ name: item.name }" class="nav-item" :title="$t(item.label)">
          <component :is="item.icon" :size="20" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ $t(item.label) }}</span>
        </RouterLink>
      </div>

      <div v-if="visibleManageItems.length" class="nav-group nav-group--manage">
        <p class="nav-group__label">{{ $t('manage') }}</p>
        <RouterLink v-for="item in visibleManageItems" :key="item.name" :to="{ name: item.name }" class="nav-item" :title="$t(item.label)">
          <component :is="item.icon" :size="20" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ $t(item.label) }}</span>
        </RouterLink>
      </div>
    </nav>

    <div class="sidebar__footer">
      <span class="status-dot" aria-hidden="true" />
      <span>{{ $t('workspaceReady') }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Braces, ChartNoAxesCombined, FileText, Inbox, KeyRound, Mail, Mails, Send, Settings, ShieldCheck, SlidersHorizontal, Star, Users } from '@lucide/vue'
import { useSettingStore } from '@/store/setting.js'
import { hasPerm } from '@/perm/perm.js'

const settingStore = useSettingStore()
const primaryItems = [
  { name: 'email', label: 'inbox', icon: Inbox },
  { name: 'send', label: 'sent', icon: Send, permission: 'email:send' },
  { name: 'draft', label: 'drafts', icon: FileText, permission: 'email:send' },
  { name: 'star', label: 'starred', icon: Star },
  { name: 'setting', label: 'settings', icon: Settings },
]
const manageItems = [
  { name: 'analysis', label: 'analytics', icon: ChartNoAxesCombined, permission: 'analysis:query' },
  { name: 'user', label: 'allUsers', icon: Users, permission: 'user:query' },
  { name: 'all-email', label: 'allMail', icon: Mails, permission: 'all-email:query' },
  { name: 'role', label: 'permissions', icon: ShieldCheck, permission: 'role:query' },
  { name: 'reg-key', label: 'inviteCode', icon: KeyRound, permission: 'reg-key:query' },
  { name: 'api-control', label: 'apiControl', icon: Braces, permission: 'api-key:query' },
  { name: 'sys-setting', label: 'SystemSettings', icon: SlidersHorizontal, permission: 'setting:query' },
]
const visiblePrimaryItems = computed(() => primaryItems.filter(item => !item.permission || hasPerm(item.permission)))
const visibleManageItems = computed(() => manageItems.filter(item => hasPerm(item.permission)))
</script>

<style scoped>
.sidebar { height: 100%; display: grid; grid-template-rows: 72px minmax(0, 1fr) 56px; overflow: hidden; }
.brand { min-width: 0; padding-inline: 20px; display: flex; align-items: center; gap: 12px; border-block-end: 1px solid var(--border); }
.brand__mark { width: 36px; height: 36px; flex: 0 0 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 11px; color: var(--primary-foreground); background: var(--primary); }
.brand__name { overflow: hidden; color: var(--foreground); font-size: 1rem; font-weight: 750; letter-spacing: -.015em; text-overflow: ellipsis; white-space: nowrap; }
.sidebar__nav { min-height: 0; overflow-y: auto; padding: 14px 10px 24px; }
.nav-group { display: grid; gap: 3px; }
.nav-group--manage { margin-block-start: 24px; padding-block-start: 16px; border-block-start: 1px solid var(--border); }
.nav-group__label { padding: 0 12px 8px; color: var(--subtle-foreground); font-size: .6875rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
.nav-item { min-width: 0; min-height: 44px; padding-inline: 12px; display: flex; align-items: center; gap: 13px; border-radius: var(--radius-control); color: var(--muted-foreground); text-decoration: none; transition: color var(--motion-fast) var(--ease-out), background-color var(--motion-fast) var(--ease-out); }
.nav-item svg { flex: 0 0 auto; }
.nav-item span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-item:hover { color: var(--foreground); background: var(--surface-subtle); }
.nav-item.router-link-active { color: var(--primary); background: var(--primary-soft); font-weight: 700; }
.sidebar__footer { padding-inline: 22px; display: flex; align-items: center; gap: 9px; border-block-start: 1px solid var(--border); color: var(--muted-foreground); font-size: .75rem; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 3px var(--success-soft); }

@media (min-width: 768px) and (max-width: 1023px) {
  .brand { justify-content: center; padding-inline: 0; }
  .brand__name, .nav-item span, .nav-group__label, .sidebar__footer span:not(.status-dot) { display: none; }
  .nav-item { padding-inline: 0; justify-content: center; }
  .nav-group--manage { margin-block-start: 12px; }
  .sidebar__footer { justify-content: center; padding-inline: 0; }
}
</style>
