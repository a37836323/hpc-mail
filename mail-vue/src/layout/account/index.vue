<template>
  <section class="mailboxes" :aria-label="$t('mailboxPanel')">
    <header class="mailboxes__header">
      <div><p>{{ $t('manageMailboxes') }}</p><span>{{ accounts.length ? $t('mailboxCount', { count: accounts.length }) : $t('optional') }}</span></div>
      <div class="mailboxes__actions">
        <IconButton v-perm="'account:add'" :label="$t('addAccount')" @click="openAdd"><Plus :size="19" /></IconButton>
        <IconButton :label="$t('refresh')" @click="refresh"><RefreshCw :size="18" :class="{ spin: loading }" /></IconButton>
        <IconButton :label="$t('closeMailboxManager')" @click="uiStore.accountShow = false"><X :size="19" /></IconButton>
      </div>
    </header>

    <div class="mailboxes__body">
      <div v-if="loading && !accounts.length" class="mailbox-skeleton" aria-live="polite">
        <span v-for="item in 4" :key="item" />
      </div>
      <div v-else-if="!accounts.length" class="mailbox-empty">
        <span class="mailbox-empty__icon"><Inbox :size="24" /></span>
        <h2>{{ $t('noSavedMailboxes') }}</h2>
        <p>{{ $t('noSavedMailboxesDescription') }}</p>
        <AppButton v-perm="'email:send'" size="sm" @click="uiStore.writerRef?.open?.()"><template #icon><SquarePen :size="17" /></template>{{ $t('compose') }}</AppButton>
        <button v-perm="'account:add'" type="button" class="text-action" @click="openAdd">{{ $t('addCommonMailbox') }}</button>
      </div>
      <ul v-else class="mailbox-list">
        <li v-for="item in accounts" :key="item.accountId" class="mailbox-item" :class="{ 'mailbox-item--active': item.accountId === accountStore.currentAccountId }">
          <button type="button" class="mailbox-item__main" @click="changeAccount(item)">
            <span class="mailbox-item__avatar">{{ item.email?.[0]?.toUpperCase() || '?' }}</span>
            <span class="mailbox-item__copy"><strong>{{ item.name || item.email?.split('@')[0] }}</strong><small :title="item.email">{{ item.email }}</small></span>
            <Check v-if="item.accountId === accountStore.currentAccountId" :size="17" class="mailbox-item__check" aria-hidden="true" />
          </button>
          <div class="mailbox-item__tools">
            <button type="button" class="mini-action" :class="{ 'mini-action--active': item.allReceive }" :aria-label="item.allReceive ? $t('catchAllEnabled') : $t('enableCatchAll')" @click="setAllReceive(item)"><Route :size="17" /></button>
            <button type="button" class="mini-action" :aria-label="$t('copy')" @click="copyAccount(item.email)"><Copy :size="17" /></button>
            <el-dropdown trigger="click">
              <button type="button" class="mini-action" :aria-label="$t('mailboxActions')"><MoreHorizontal :size="18" /></button>
              <template #dropdown><el-dropdown-menu>
                <el-dropdown-item v-if="hasPerm('email:send')" @click="openRename(item)">{{ $t('rename') }}</el-dropdown-item>
                <el-dropdown-item v-if="item.accountId !== userStore.user?.account?.accountId" @click="pinMailbox(item)">{{ $t('pin') }}</el-dropdown-item>
                <el-dropdown-item v-if="item.accountId !== userStore.user?.account?.accountId && hasPerm('account:delete')" divided @click="removeMailbox(item)">{{ $t('delete') }}</el-dropdown-item>
              </el-dropdown-menu></template>
            </el-dropdown>
          </div>
        </li>
      </ul>
      <button v-if="accounts.length && !noMore" type="button" class="load-more" :disabled="loadingMore" @click="getAccountList">{{ loadingMore ? $t('loading') : $t('loadMore') }}</button>
    </div>

    <el-dialog v-model="showAdd" :title="$t('addAccount')" width="420">
      <form class="dialog-form" @submit.prevent="submitAdd">
        <FormField :label="$t('emailPrefix')" for-id="mailbox-prefix" :error="addError">
          <div class="address-control"><input id="mailbox-prefix" ref="addRef" v-model.trim="addForm.localPart" autocomplete="off" :placeholder="$t('senderLocalPartExample')" @blur="validateLocalPart" /><span>@</span><select v-model="addForm.domain" :aria-label="$t('domain')"><option v-for="domain in domainList" :key="domain" :value="domain">{{ domain }}</option></select></div>
        </FormField>
        <div v-show="verifyShow" class="add-email-turnstile" :data-sitekey="settingStore.settings.siteKey" data-callback="onMailboxTurnstileSuccess" data-error-callback="onMailboxTurnstileError"><span v-if="botJsError" class="dialog-error">{{ $t('verifyModuleFailed') }}</span></div>
        <AppButton type="submit" :loading="addLoading">{{ $t('addAccountAction') }}</AppButton>
      </form>
    </el-dialog>
    <el-dialog v-model="showRename" :title="$t('changeUserName')" width="420">
      <form class="dialog-form" @submit.prevent="saveName"><FormField :label="$t('displayName')" for-id="mailbox-name"><div class="simple-input"><input id="mailbox-name" v-model.trim="accountName" autocomplete="off" /></div></FormField><AppButton type="submit" :loading="renameLoading">{{ $t('saveChanges') }}</AppButton></form>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { Check, Copy, Inbox, MoreHorizontal, Plus, RefreshCw, Route, SquarePen, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { accountAdd, accountDelete, accountList, accountSetAllReceive, accountSetAsTop, accountSetName } from '@/request/account.js'
import { AccountAllReceiveEnum } from '@/enums/account-enum.js'
import { hasPerm } from '@/perm/perm.js'
import { useAccountStore } from '@/store/account.js'
import { useEmailStore } from '@/store/email.js'
import { useSettingStore } from '@/store/setting.js'
import { useUiStore } from '@/store/ui.js'
import { useUserStore } from '@/store/user.js'

const { t } = useI18n()
const accountStore = useAccountStore()
const emailStore = useEmailStore()
const settingStore = useSettingStore()
const uiStore = useUiStore()
const userStore = useUserStore()
const accounts = reactive([])
const loading = ref(false)
const loadingMore = ref(false)
const noMore = ref(false)
const showAdd = ref(false)
const showRename = ref(false)
const addLoading = ref(false)
const renameLoading = ref(false)
const addError = ref('')
const accountName = ref('')
const addRef = ref(null)
const verifyShow = ref(false)
const botJsError = ref(false)
let activeAccount = null
let verifyToken = ''
let turnstileId = null
let verifyErrors = 0
const pageSize = 30
const domainList = computed(() => (settingStore.domainList || []).map(domain => String(domain).replace(/^@/, '')).filter(Boolean))
const addForm = reactive({ localPart: '', domain: domainList.value[0] || '' })

window.onMailboxTurnstileSuccess = token => { verifyToken = token }
window.onMailboxTurnstileError = () => {
  if (verifyErrors++ >= 4) return
  window.setTimeout(() => nextTick(() => { try { window.turnstile?.reset(turnstileId) } catch { botJsError.value = true } }), 1500)
}

watch(domainList, domains => { if (!domains.includes(addForm.domain)) addForm.domain = domains[0] || '' }, { immediate: true })
watch(() => accountStore.changeUserAccountName, name => { if (accounts[0] && name) accounts[0].name = name })

async function getAccountList() {
  if (loading.value || loadingMore.value || noMore.value) return
  const isFirst = !accounts.length
  if (isFirst) loading.value = true; else loadingMore.value = true
  try {
    const last = accounts.at(-1)
    const list = await accountList(last?.accountId || 0, pageSize, last?.sort ?? null)
    if (list.length < pageSize) noMore.value = true
    accounts.push(...list)
    accountStore.hasAccounts = accounts.length > 0
    if (!accountStore.currentAccountId && accounts[0]) changeAccount(accounts[0])
  } finally { loading.value = false; loadingMore.value = false }
}
async function refresh() {
  accounts.splice(0); noMore.value = false; accountStore.hasAccounts = false; await getAccountList()
}
function changeAccount(account) { accountStore.currentAccountId = account.accountId; accountStore.currentAccount = account }
function openAdd() { showAdd.value = true; nextTick(() => addRef.value?.focus()) }
function validateLocalPart() {
  const value = addForm.localPart
  addError.value = !value ? t('localPartRequired') : !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/.test(value) || value.startsWith('.') || value.endsWith('.') || value.includes('..') ? t('localPartInvalid') : !addForm.domain ? t('domainRequired') : ''
  return !addError.value
}
async function submitAdd() {
  if (!validateLocalPart()) return
  if (!verifyToken && needsVerification()) { revealVerification(); return }
  addLoading.value = true
  try {
    const account = await accountAdd(`${addForm.localPart}@${addForm.domain}`, verifyToken)
    accounts.push(account); accountStore.hasAccounts = true; changeAccount(account)
    addForm.localPart = ''; verifyToken = ''; verifyShow.value = false; showAdd.value = false
    userStore.refreshUserInfo(); ElMessage({ message: t('addSuccessMsg'), type: 'success', plain: true })
  } catch (error) { if (error?.code === 400) { verifyToken = ''; revealVerification() } }
  finally { addLoading.value = false }
}
function needsVerification() { return settingStore.settings.addEmailVerify === 0 || (settingStore.settings.addEmailVerify === 2 && settingStore.settings.addVerifyOpen) }
function revealVerification() {
  verifyShow.value = true
  nextTick(() => { try { if (!turnstileId) turnstileId = window.turnstile?.render('.add-email-turnstile'); else window.turnstile?.reset(turnstileId) } catch { botJsError.value = true } })
}
function openRename(account) { activeAccount = account; accountName.value = account.name || ''; showRename.value = true }
async function saveName() {
  if (!accountName.value || !activeAccount) return
  renameLoading.value = true
  try { await accountSetName(activeAccount.accountId, accountName.value); activeAccount.name = accountName.value; showRename.value = false; ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true }) }
  finally { renameLoading.value = false }
}
async function setAllReceive(account) {
  const previous = accounts.find(item => item.allReceive === AccountAllReceiveEnum.ENABLED)
  if (previous && previous !== account) previous.allReceive = AccountAllReceiveEnum.DISABLED
  account.allReceive = account.allReceive === AccountAllReceiveEnum.ENABLED ? AccountAllReceiveEnum.DISABLED : AccountAllReceiveEnum.ENABLED
  try { await accountSetAllReceive(account.accountId); changeAccount(account); emailStore.emailScroll?.refreshList?.() }
  catch { account.allReceive = account.allReceive === AccountAllReceiveEnum.ENABLED ? AccountAllReceiveEnum.DISABLED : AccountAllReceiveEnum.ENABLED; if (previous) previous.allReceive = AccountAllReceiveEnum.ENABLED }
}
async function pinMailbox(account) { await accountSetAsTop(account.accountId); const index = accounts.indexOf(account); accounts.splice(index, 1); accounts.unshift(account) }
function removeMailbox(account) {
  ElMessageBox.confirm(t('delConfirm', { msg: account.email }), { confirmButtonText: t('delete'), cancelButtonText: t('cancel'), type: 'warning' }).then(async () => {
    await accountDelete(account.accountId); const index = accounts.indexOf(account); accounts.splice(index, 1); accountStore.hasAccounts = Boolean(accounts.length)
    if (accountStore.currentAccountId === account.accountId) accounts[0] ? changeAccount(accounts[0]) : changeAccount({ accountId: 0 })
  })
}
async function copyAccount(email) { try { await navigator.clipboard.writeText(email); ElMessage({ message: t('copySuccessMsg'), type: 'success', plain: true }) } catch { ElMessage({ message: t('copyFailMsg'), type: 'error', plain: true }) } }

getAccountList()
</script>

<style scoped>
.mailboxes { height: 100%; display: grid; grid-template-rows: 64px minmax(0, 1fr); border-inline-end: 1px solid var(--border); background: var(--surface); overflow: hidden; }
.mailboxes__header { padding-inline: 14px 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border-block-end: 1px solid var(--border); }
.mailboxes__header > div:first-child { min-width: 0; display: grid; }
.mailboxes__header p { font-size: .875rem; font-weight: 720; }
.mailboxes__header span { color: var(--subtle-foreground); font-size: .6875rem; }
.mailboxes__actions { display: flex; }
.mailboxes__body { min-height: 0; padding: 10px; overflow-y: auto; }
.mailbox-list { display: grid; gap: 6px; }
.mailbox-item { padding: 4px; border: 1px solid transparent; border-radius: var(--radius-card); }
.mailbox-item:hover { background: var(--surface-subtle); }
.mailbox-item--active { border-color: color-mix(in oklch, var(--primary) 28%, var(--border)); background: var(--primary-soft); }
.mailbox-item__main { width: 100%; min-height: 54px; padding: 6px; display: grid; grid-template-columns: 36px minmax(0, 1fr) 20px; align-items: center; gap: 10px; text-align: start; background: transparent; cursor: pointer; }
.mailbox-item__avatar { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; color: var(--primary); background: var(--surface); font-size: .8125rem; font-weight: 760; }
.mailbox-item__copy { min-width: 0; display: grid; }
.mailbox-item__copy strong, .mailbox-item__copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mailbox-item__copy strong { font-size: .8125rem; }
.mailbox-item__copy small { color: var(--muted-foreground); font-size: .6875rem; }
.mailbox-item__check { color: var(--primary); }
.mailbox-item__tools { padding: 2px 4px 4px 50px; display: flex; justify-content: flex-end; gap: 2px; }
.mini-action { width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); color: var(--subtle-foreground); background: transparent; cursor: pointer; }
.mini-action:hover { color: var(--foreground); background: var(--surface); }
.mini-action--active { color: var(--success); }
.mailbox-empty { height: 100%; padding: 28px 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.mailbox-empty__icon { width: 48px; height: 48px; display: inline-flex; align-items: center; justify-content: center; border-radius: 14px; color: var(--primary); background: var(--primary-soft); }
.mailbox-empty h2 { margin-block-start: 16px; font-size: .9375rem; }
.mailbox-empty p { margin-block: 7px 20px; color: var(--muted-foreground); font-size: .8125rem; line-height: 1.5; }
.text-action, .load-more { min-height: 40px; padding-inline: 10px; color: var(--primary); background: transparent; font-weight: 650; cursor: pointer; }
.mailbox-skeleton { display: grid; gap: 8px; }
.mailbox-skeleton span { height: 74px; border-radius: var(--radius-card); background: var(--surface-subtle); animation: pulse 1.4s ease-in-out infinite alternate; }
.spin { animation: spin .8s linear infinite; }
.dialog-form { display: grid; gap: 20px; }
.address-control, .simple-input { min-height: 46px; padding-inline: 12px; display: flex; align-items: center; border: 1px solid var(--border-strong); border-radius: var(--radius-control); background: var(--surface); }
.address-control:focus-within, .simple-input:focus-within { border-color: var(--focus-ring); box-shadow: 0 0 0 3px color-mix(in oklch, var(--focus-ring) 18%, transparent); }
.address-control input, .simple-input input { width: 100%; min-width: 0; height: 44px; border: 0; outline: 0; background: transparent; }
.address-control span { color: var(--muted-foreground); }
.address-control select { max-width: 46%; height: 44px; border: 0; outline: 0; color: var(--foreground); background: transparent; }
.dialog-error { color: var(--destructive); font-size: .8125rem; }
@keyframes pulse { to { opacity: .55; } }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
