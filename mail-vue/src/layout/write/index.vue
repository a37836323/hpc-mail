<template>
  <DialogRoot :open="show" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="compose-overlay" />
      <DialogContent
        class="compose-dialog"
        :aria-describedby="undefined"
        @pointer-down-outside.prevent
        @interact-outside.prevent
        @keydown.meta.enter.prevent="handleSendShortcut"
        @keydown.ctrl.enter.prevent="handleSendShortcut"
      >
        <header class="compose-header">
          <div>
            <DialogTitle>{{ form.sendType === 'reply' ? $t('replyMessage') : form.sendType === 'forward' ? $t('forwardMessage') : $t('composeMessage') }}</DialogTitle>
            <p>{{ $t('composeDescription') }}</p>
          </div>
          <IconButton :label="$t('closeComposer')" @click="requestClose"><X :size="20" /></IconButton>
        </header>

        <div class="compose-body">
          <section class="sender-section" :class="{ 'sender-section--expanded': senderExpanded }" :aria-label="$t('senderIdentity')">
            <button type="button" class="sender-mobile-summary" :aria-expanded="senderExpanded" @click="senderExpanded = !senderExpanded">
              <span><strong>{{ $t('senderIdentity') }}</strong><small>{{ senderAddress || $t('senderAddressIncomplete') }}</small></span>
              <ChevronDown :size="19" aria-hidden="true" />
            </button>
            <div class="sender-section__content">
              <div class="sender-section__heading">
                <div><h2 id="sender-heading">{{ $t('senderIdentity') }}</h2><p>{{ $t('senderIdentityDescription') }}</p></div>
                <select v-if="recentSenders.length" class="recent-sender" :aria-label="$t('recentSenderAddresses')" @change="applyRecentSender($event.target.value)">
                  <option value="">{{ $t('recentSender') }}</option>
                  <option v-for="sender in recentSenders" :key="sender.address" :value="sender.address">{{ sender.address }}</option>
                </select>
              </div>
              <div class="sender-grid">
                <FormField :label="$t('displayNameOptional')" for-id="sender-name">
                  <div class="compose-input"><UserRound :size="17" /><input id="sender-name" v-model.trim="form.name" autocomplete="name" :placeholder="$t('displayNameExample')" @input="markDirty" /></div>
                </FormField>
                <FormField :label="$t('emailPrefix')" for-id="sender-local" :error="senderErrors.localPart">
                  <div class="compose-input"><AtSign :size="17" /><input id="sender-local" ref="localPartRef" v-model.trim="form.localPart" autocomplete="off" autocapitalize="none" spellcheck="false" :placeholder="$t('senderLocalPartExample')" :aria-invalid="Boolean(senderErrors.localPart)" :disabled="!availableDomains.length" @input="markDirty" @blur="validateLocalPart" /></div>
                </FormField>
                <FormField :label="$t('domain')" for-id="sender-domain" :error="senderErrors.domain">
                  <div class="compose-input compose-select"><Globe2 :size="17" /><select id="sender-domain" v-model="form.domain" :aria-invalid="Boolean(senderErrors.domain)" :disabled="!availableDomains.length" @change="markDirty(); validateDomain()"><option disabled value="">{{ $t('selectDomain') }}</option><option v-for="domain in availableDomains" :key="domain" :value="domain">{{ domain }}</option></select><ChevronDown :size="16" /></div>
                </FormField>
              </div>
              <p v-if="!availableDomains.length" class="domain-empty" role="alert"><CircleAlert :size="17" aria-hidden="true" /><span><strong>{{ $t('noAuthorizedSenderDomains') }}</strong>{{ $t('noAuthorizedSenderDomainsDescription') }}</span></p>
              <div class="sender-preview" :class="{ 'sender-preview--valid': senderValid }" aria-live="polite">
                <CheckCircle2 v-if="senderValid" :size="18" aria-hidden="true" />
                <CircleAlert v-else :size="18" aria-hidden="true" />
                <span><small>{{ senderValid ? $t('readyToSendFrom') : $t('senderPreview') }}</small><strong>{{ senderAddress || $t('senderAddressIncomplete') }}</strong></span>
              </div>
              <p v-if="senderFallbackNotice" class="sender-fallback" role="status"><Info :size="16" />{{ senderFallbackNotice }}</p>
            </div>
          </section>

          <section class="message-fields" :aria-label="$t('messageDetails')">
            <div class="recipient-row">
              <label for="compose-recipient">{{ $t('recipient') }}</label>
              <el-input-tag id="compose-recipient" v-model="form.receiveEmail" tag-type="primary" :placeholder="$t('recipientPlaceholder')" :aria-invalid="Boolean(fieldErrors.recipient)" @add-tag="addTagChange" @input="markDirty" />
              <IconButton :label="$t('recentContacts')" @click="openContacts"><ContactRound :size="19" /></IconButton>
            </div>
            <p v-if="fieldErrors.recipient" class="compose-error" role="alert">{{ fieldErrors.recipient }}</p>
            <div class="subject-row"><label for="compose-subject">{{ $t('subject') }}</label><input id="compose-subject" v-model="form.subject" :placeholder="$t('subjectPlaceholderModern')" @input="markDirty" /></div>
            <p v-if="fieldErrors.subject" class="compose-error" role="alert">{{ fieldErrors.subject }}</p>
          </section>

          <section class="editor-section" :aria-label="$t('messageBody')">
            <TinyEditor :def-value="defValue" ref="editor" @change="changeEditor" />
          </section>
          <p v-if="fieldErrors.content" class="compose-error compose-error--body" role="alert">{{ fieldErrors.content }}</p>

          <section v-if="form.attachments.length" class="attachments" :aria-label="$t('attachments')">
            <div v-for="(item, index) in form.attachments" :key="`${item.filename}-${index}`" class="attachment-item">
              <Paperclip :size="18" /><span><strong>{{ item.filename }}</strong><small>{{ formatBytes(item.size) }}</small></span><IconButton :label="$t('removeAttachment', { name: item.filename })" @click="deleteAttachment(index)"><X :size="17" /></IconButton>
            </div>
          </section>
        </div>

        <footer class="compose-footer">
          <div class="compose-footer__tools">
            <input ref="fileInput" class="sr-only" type="file" multiple @change="filesSelected" />
            <IconButton :label="$t('addAttachment')" @click="fileInput?.click()"><Paperclip :size="20" /></IconButton>
            <IconButton :label="$t('clearContent')" @click="clearContent"><Eraser :size="20" /></IconButton>
          </div>
          <p class="draft-status" role="status">
            <LoaderCircle v-if="draftSaving" :size="15" class="spin" />
            <Check v-else-if="form.draftId && !dirty" :size="15" />
            <span>{{ draftStatusText }}</span>
          </p>
          <div class="compose-footer__actions">
            <button v-if="form.draftId" type="button" class="discard-action" @click="confirmDiscard"><Trash2 :size="17" /><span>{{ $t('deleteDraft') }}</span></button>
            <AppButton :loading="sending" :disabled="!canSend" @click="sendEmail">
              <template #icon><Send :size="18" /></template>
              {{ form.sendType === 'reply' ? $t('reply') : form.sendType === 'forward' ? $t('forward') : $t('send') }}
            </AppButton>
          </div>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <el-dialog v-model="showContacts" :title="$t('recentContacts')" width="480" @closed="clearSelectedContacts">
    <div class="contacts-dialog">
      <el-table ref="contactsTable" row-key="email" :data="contacts" height="360" empty-text="">
        <el-table-column type="selection" width="48" />
        <el-table-column property="email" :label="$t('emailAccount')"><template #default="scope"><span class="contact-email">{{ scope.row.email }}</span></template></el-table-column>
      </el-table>
      <div v-if="!contacts.length" class="contacts-empty"><ContactRound :size="26" /><p>{{ $t('noRecentContacts') }}</p></div>
      <div class="contacts-actions"><AppButton variant="ghost" @click="deleteContacts">{{ $t('clearSelected') }}</AppButton><AppButton @click="chooseContacts">{{ $t('addRecipients') }}</AppButton></div>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, h, nextTick, onBeforeUnmount, reactive, ref, toRaw, watch } from 'vue'
import { AtSign, Check, CheckCircle2, ChevronDown, CircleAlert, ContactRound, Eraser, Globe2, Info, LoaderCircle, Paperclip, Send, Trash2, UserRound, X } from '@lucide/vue'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import IconButton from '@/components/ui/IconButton.vue'
import TinyEditor from '@/components/tiny-editor/index.vue'
import db from '@/db/db.js'
import { emailSend } from '@/request/email.js'
import router from '@/router/index.js'
import { useAccountStore } from '@/store/account.js'
import { userDraftStore } from '@/store/draft.js'
import { useEmailStore } from '@/store/email.js'
import { useSettingStore } from '@/store/setting.js'
import { useUserStore } from '@/store/user.js'
import { useWriterStore } from '@/store/writer.js'
import { formatDetailDate } from '@/utils/day.js'
import { fileToBase64, formatBytes } from '@/utils/file-utils.js'
import { isEmail } from '@/utils/verify-utils.js'
import { toOssDomain } from '@/utils/convert.js'
import { normalizeDomain, resolveAuthorizedDomains } from '@/utils/domain.js'
import { resolveDefaultSenderAccount } from '@/utils/default-sender.js'

defineExpose({ open, openReply, openForward, openDraft })

const { t } = useI18n()
const accountStore = useAccountStore()
const draftStore = userDraftStore()
const emailStore = useEmailStore()
const settingStore = useSettingStore()
const userStore = useUserStore()
const writerStore = useWriterStore()
const show = ref(false)
const sending = ref(false)
const draftSaving = ref(false)
const dirty = ref(false)
const defValue = ref('')
const editor = ref(null)
const localPartRef = ref(null)
const fileInput = ref(null)
const showContacts = ref(false)
const senderExpanded = ref(false)
const contactsTable = ref(null)
const senderFallbackNotice = ref('')
const senderErrors = reactive({ localPart: '', domain: '' })
const fieldErrors = reactive({ recipient: '', subject: '', content: '' })
let autosaveTimer = null
let suspendAutosave = false
const form = reactive({
  name: '', localPart: '', domain: '', sendEmail: '', accountId: 0,
  receiveEmail: [], subject: '', content: '', text: '', sendType: '', emailId: 0,
  attachments: [], draftId: null, createTime: '',
})
const initialReply = reactive({ receiveEmail: [], subject: '', content: '', sendType: '' })
const availableDomains = computed(() => resolveAuthorizedDomains(
  settingStore.domainList,
  userStore.user?.role?.availDomain,
  (userStore.user?.permKeys || []).includes('*'),
))
const senderAddress = computed(() => form.localPart && form.domain ? `${form.localPart}@${form.domain}` : '')
const senderValid = computed(() => !senderErrors.localPart && !senderErrors.domain && Boolean(form.localPart && form.domain && availableDomains.value.includes(form.domain)))
const canSend = computed(() => senderValid.value && form.receiveEmail.length > 0 && Boolean(form.subject.trim()) && !sending.value)
const recentSenders = computed(() => (writerStore.senderHistory || [])
  .map(item => typeof item === 'string' ? { address: item, name: '' } : item)
  .filter(item => {
    const parsed = item.address && parseAddress(item.address)
    return parsed && availableDomains.value.includes(parsed.domain)
  }))
const contacts = computed(() => (writerStore.sendRecipientRecord || []).map(email => ({ email })))
const draftStatusText = computed(() => draftSaving.value ? t('savingDraft') : dirty.value ? t('draftPending') : form.draftId ? t('draftSaved') : t('draftAutoSaveHint'))

watch(form, () => {
  if (!show.value || suspendAutosave) return
  dirty.value = true
  scheduleAutosave()
}, { deep: true })
watch(availableDomains, domains => {
  if (!show.value || domains.includes(form.domain)) return
  chooseDefaultSender()
  validateSender()
})

function handleOpenChange(opened) { if (!opened && show.value) requestClose() }
function markDirty() { dirty.value = true; scheduleAutosave() }
function scheduleAutosave() {
  window.clearTimeout(autosaveTimer)
  if (!hasMeaningfulContent()) return
  autosaveTimer = window.setTimeout(() => persistDraft(true), 2000)
}
function hasMeaningfulContent() { return Boolean(form.content || form.subject || form.receiveEmail.length || form.attachments.length) }

function parseAddress(address) {
  if (!address || typeof address !== 'string') return null
  const clean = address.trim().replace(/^<|>$/g, '')
  const index = clean.lastIndexOf('@')
  if (index <= 0) return null
  return { localPart: clean.slice(0, index), domain: normalizeDomain(clean.slice(index + 1)) }
}
function setSenderFromAddress(address, name = '', accountId = 0) {
  const parsed = parseAddress(address)
  if (!parsed || !availableDomains.value.includes(parsed.domain)) return false
  form.localPart = parsed.localPart
  form.domain = parsed.domain
  form.name = name || writerStore.senderName || userStore.user?.displayName || ''
  form.accountId = accountId || 0
  form.sendEmail = `${parsed.localPart}@${parsed.domain}`
  validateSender()
  return true
}
function chooseDefaultSender(preferredAddress = '') {
  senderFallbackNotice.value = ''
  if (!availableDomains.value.length) {
    form.domain = ''
    form.sendEmail = ''
    form.accountId = 0
    return false
  }
  const account = resolveDefaultSenderAccount(
    accountStore.currentAccount,
    userStore.user?.defaultAccount,
    preferredAddress,
  )
  if (account && setSenderFromAddress(account.email, account.name, account.accountId)) return true
  form.localPart = ''
  form.domain = availableDomains.value[0] || ''
  form.sendEmail = ''
  form.name = userStore.user?.displayName || ''
  form.accountId = 0
  return false
}
function applyRecentSender(address) {
  if (!address) return
  const recent = recentSenders.value.find(item => item.address === address)
  setSenderFromAddress(address, recent?.name)
}
function validateLocalPart() {
  const value = form.localPart
  senderErrors.localPart = !value ? t('localPartRequired') : value.length > 64 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(value) || value.startsWith('.') || value.endsWith('.') || value.includes('..') ? t('localPartInvalid') : ''
  form.sendEmail = senderAddress.value
  return !senderErrors.localPart
}
function validateDomain() { senderErrors.domain = !form.domain ? t('domainRequired') : !availableDomains.value.includes(form.domain) ? t('domainUnauthorized') : ''; return !senderErrors.domain }
function validateSender() { return validateLocalPart() && validateDomain() }

function open() {
  if (!form.localPart || !availableDomains.value.includes(form.domain)) chooseDefaultSender()
  suspendAutosave = true
  show.value = true
  validateSender()
  nextTick(() => {
    suspendAutosave = false
    ;(form.localPart ? editor.value : localPartRef.value)?.focus?.()
  })
}
function openReply(email) {
  resetForm()
  form.receiveEmail = [email.sendEmail]
  const subject = email.subject || ''
  form.subject = /^(Re:|Re：|回复：|回复:)/i.test(subject) ? subject : `Re: ${subject}`
  form.sendType = 'reply'
  form.emailId = email.emailId || 0
  const originalRecipient = Array.isArray(email.toEmail) ? email.toEmail[0] : email.toEmail
  if (!chooseDefaultSender(originalRecipient) && originalRecipient) senderFallbackNotice.value = t('replySenderUnavailable')
  else if (originalRecipient && senderAddress.value.toLowerCase() !== String(originalRecipient).toLowerCase()) senderFallbackNotice.value = t('replySenderFallback', { address: senderAddress.value })
  defValue.value = `<div></div><div><br>${formatDetailDate(email.createTime)} ${escapeHtml(email.name || '')} &lt;${escapeHtml(email.sendEmail || '')}&gt; ${t('wrote')}:</div><blockquote class="mceNonEditable" style="margin:0 0 0 .8ex;border-left:1px solid #ccd2dc;padding-left:1ex">${formatImage(email.content) || `<pre style="font-family:inherit;word-break:break-word;white-space:pre-wrap;margin:0">${escapeHtml(email.text || '')}</pre>`}</blockquote>`
  open()
  nextTick(snapshotInitialReply)
}
function openForward(email) {
  resetForm()
  form.subject = email.subject || ''
  form.sendType = 'forward'
  chooseDefaultSender()
  defValue.value = formatImage(email.content) || `<pre style="font-family:inherit;word-break:break-word;white-space:pre-wrap;margin:0">${escapeHtml(email.text || '')}</pre>`
  open()
  nextTick(snapshotInitialReply)
}
function openDraft(draft) {
  resetForm()
  suspendAutosave = true
  Object.assign(form, { ...draft, attachments: draft.attachments || [], receiveEmail: draft.receiveEmail || [] })
  form.domain = normalizeDomain(form.domain)
  if ((!form.localPart || !availableDomains.value.includes(String(form.domain || '').toLowerCase())) && form.sendEmail) setSenderFromAddress(form.sendEmail, form.name, form.accountId)
  if (!form.localPart || !availableDomains.value.includes(String(form.domain || '').toLowerCase())) chooseDefaultSender()
  defValue.value = form.content || ''
  show.value = true
  dirty.value = false
  nextTick(() => { suspendAutosave = false; editor.value?.focus?.() })
}
function snapshotInitialReply() { initialReply.content = editor.value?.getContent?.() || ''; initialReply.subject = form.subject; initialReply.receiveEmail = [...form.receiveEmail]; initialReply.sendType = form.sendType; dirty.value = false }

function addTagChange(value) {
  const values = String(value || '').split(/[,，;；\s]+/).map(item => item.trim()).filter(Boolean)
  form.receiveEmail = [...new Set(form.receiveEmail.filter(isEmail).concat(values.filter(isEmail)))]
  fieldErrors.recipient = ''
  markDirty()
}
function changeEditor(content, text) { form.content = content; form.text = text; fieldErrors.content = ''; markDirty() }
async function filesSelected(event) {
  const files = Array.from(event.target.files || [])
  for (const file of files) form.attachments.push({ content: await fileToBase64(file), filename: file.name, size: file.size, contentType: file.type })
  event.target.value = ''; markDirty()
}
function deleteAttachment(index) { form.attachments.splice(index, 1); markDirty() }
function clearContent() {
  ElMessageBox.confirm(t('clearContentConfirm'), { confirmButtonText: t('clearContent'), cancelButtonText: t('keepEditing'), type: 'warning' }).then(() => { form.content = ''; form.text = ''; editor.value?.clearEditor?.(); markDirty() })
}

async function sendEmail() {
  fieldErrors.recipient = form.receiveEmail.length && form.receiveEmail.every(isEmail) ? '' : t('recipientInvalid')
  fieldErrors.subject = form.subject.trim() ? '' : t('emptySubjectMsg')
  form.content = editor.value?.getContent?.() || form.content
  fieldErrors.content = form.content ? '' : t('emptyContentMsg')
  const senderReady = validateSender()
  if (!senderReady) senderExpanded.value = true
  if (!senderReady || fieldErrors.recipient || fieldErrors.subject || fieldErrors.content || sending.value) return
  sending.value = true
  const payload = {
    ...toRaw(form),
    sendEmail: senderAddress.value,
    accountId: form.accountId || 0,
    from: { name: form.name || '', localPart: form.localPart, domain: form.domain },
  }
  try {
    const emailList = await emailSend(payload, () => {})
    ;(emailList || []).forEach(item => emailStore.sendScroll?.addItem?.(item))
    rememberSender()
    rememberRecipients()
    if (form.draftId) await deleteDraftRecord(form.draftId)
    userStore.refreshUserInfo()
    ElNotification({ title: t('sendSuccessMsg'), type: 'success', message: h('span', { style: 'color:var(--foreground)' }, form.subject), position: 'bottom-right' })
    show.value = false
    resetForm()
  } catch (error) {
    ElNotification({ title: t('sendFailMsg'), type: error?.code === 403 ? 'warning' : 'error', message: error?.message || t('sendRetryHint'), position: 'bottom-right', duration: 0 })
    dirty.value = true
    scheduleAutosave()
    if (error?.code === 401) { localStorage.removeItem('token'); await router.replace('/login') }
  } finally { sending.value = false }
}
async function handleSendShortcut() {
  if (!writerStore.shortcutConfirmed) {
    try {
      await ElMessageBox.confirm(t('sendShortcutFirstUse'), { confirmButtonText: t('sendNow'), cancelButtonText: t('keepEditing'), type: 'info' })
      writerStore.shortcutConfirmed = true
    } catch { return }
  }
  await sendEmail()
}
function rememberSender() {
  writerStore.senderName = form.name || ''
  const address = senderAddress.value
  writerStore.senderHistory = [{ address, name: form.name || '' }, ...recentSenders.value.filter(item => item.address !== address)].slice(0, 8)
}
function rememberRecipients() {
  writerStore.sendRecipientRecord = [...form.receiveEmail, ...writerStore.sendRecipientRecord.filter(email => !form.receiveEmail.includes(email))].slice(0, 500)
}

async function persistDraft(silent = false) {
  window.clearTimeout(autosaveTimer)
  if (!hasMeaningfulContent() || sending.value || !show.value) return
  draftSaving.value = true
  form.content = editor.value?.getContent?.() || form.content
  const record = structuredClone(toRaw(form))
  const attachments = record.attachments
  delete record.attachments
  try {
    if (record.draftId) {
      const draftId = record.draftId
      delete record.draftId
      await db.value.draft.update(draftId, record)
      await db.value.att.put({ draftId, attachments })
    } else {
      record.createTime = dayjs().utc().format('YYYY-MM-DD HH:mm:ss')
      delete record.draftId
      form.draftId = await db.value.draft.add(record)
      form.createTime = record.createTime
      await db.value.att.put({ draftId: form.draftId, attachments })
    }
    dirty.value = false
    draftStore.refreshList++
    if (!silent) ElMessage({ message: t('draftSaved'), type: 'success', plain: true })
  } finally { draftSaving.value = false }
}
async function requestClose() {
  if (sending.value) return
  if (!dirty.value) { show.value = false; resetForm(); return }
  try {
    await ElMessageBox.confirm(t('saveDraftConfirmModern'), { confirmButtonText: t('saveDraft'), cancelButtonText: t('discardChanges'), distinguishCancelAndClose: true, type: 'warning' })
    await persistDraft(false)
    show.value = false; resetForm()
  } catch (action) {
    if (action === 'cancel') { if (form.draftId) await deleteDraftRecord(form.draftId); show.value = false; resetForm() }
  }
}
async function confirmDiscard() {
  try { await ElMessageBox.confirm(t('deleteDraftConfirm'), { confirmButtonText: t('deleteDraft'), cancelButtonText: t('keepEditing'), type: 'warning' }); await deleteDraftRecord(form.draftId); show.value = false; resetForm() } catch {}
}
async function deleteDraftRecord(draftId) { if (!draftId) return; await Promise.all([db.value.draft.delete(draftId), db.value.att.delete(draftId)]); draftStore.refreshList++ }

function openContacts() { showContacts.value = true; nextTick(() => form.receiveEmail.forEach(email => { if (writerStore.sendRecipientRecord.includes(email)) contactsTable.value?.toggleRowSelection?.({ email }) })) }
function chooseContacts() { const selected = contactsTable.value?.getSelectionRows?.().map(item => item.email) || []; form.receiveEmail = [...new Set([...form.receiveEmail, ...selected])]; showContacts.value = false; markDirty() }
function deleteContacts() { const selected = contactsTable.value?.getSelectionRows?.().map(item => item.email) || []; writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.filter(email => !selected.includes(email)); form.receiveEmail = form.receiveEmail.filter(email => !selected.includes(email)); showContacts.value = false }
function clearSelectedContacts() { contactsTable.value?.clearSelection?.() }
function formatImage(content = '') { return content.replace(/{{domain}}/g, `${toOssDomain(settingStore.settings.r2Domain)}/`) }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]) }
function resetForm() {
  window.clearTimeout(autosaveTimer)
  suspendAutosave = true
  Object.assign(form, { name: '', localPart: '', domain: '', sendEmail: '', accountId: 0, receiveEmail: [], subject: '', content: '', text: '', sendType: '', emailId: 0, attachments: [], draftId: null, createTime: '' })
  Object.assign(senderErrors, { localPart: '', domain: '' }); Object.assign(fieldErrors, { recipient: '', subject: '', content: '' }); Object.assign(initialReply, { receiveEmail: [], subject: '', content: '', sendType: '' })
  senderFallbackNotice.value = ''; defValue.value = ''; dirty.value = false; editor.value?.clearEditor?.()
  senderExpanded.value = false
  nextTick(() => { suspendAutosave = false })
}

onBeforeUnmount(() => window.clearTimeout(autosaveTimer))
</script>

<style scoped>
.compose-overlay { position: fixed; inset: 0; z-index: var(--z-overlay); background: var(--overlay); animation: fade-in var(--motion-base) var(--ease-out); }
.compose-dialog { position: fixed; inset-block-start: 50%; inset-inline-start: 50%; z-index: var(--z-modal); width: min(880px, calc(100vw - 48px)); height: min(820px, calc(100dvh - 48px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--surface); box-shadow: var(--shadow-floating); transform: translate(-50%, -50%); overflow: hidden; }
.compose-header { min-height: 68px; padding: 12px 14px 12px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-block-end: 1px solid var(--border); }
.compose-header > div { min-width: 0; }
.compose-header [role='heading'] { color: var(--foreground); font-size: 1.0625rem; font-weight: 740; }
.compose-header p { margin-block-start: 2px; color: var(--muted-foreground); font-size: .75rem; }
.compose-body { min-height: 0; overflow-y: auto; }
.sender-section { padding: 20px 24px; border-block-end: 1px solid var(--border); background: var(--surface-subtle); }
.sender-mobile-summary { display: none; }
.sender-section__content { min-width: 0; }
.sender-section__heading { margin-block-end: 14px; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.sender-section__heading h2 { font-size: .875rem; font-weight: 720; }
.sender-section__heading p { margin-block-start: 2px; color: var(--muted-foreground); font-size: .75rem; }
.recent-sender { min-height: 44px; max-width: 260px; padding-inline: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--muted-foreground); background: var(--surface); font-size: .75rem; }
.sender-grid { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.compose-input { min-height: 44px; padding-inline: 12px; display: flex; align-items: center; gap: 9px; border: 1px solid var(--border-strong); border-radius: var(--radius-control); background: var(--surface); }
.compose-input:focus-within { border-color: var(--focus-ring); box-shadow: 0 0 0 3px color-mix(in oklch, var(--focus-ring) 17%, transparent); }
.compose-input > svg { flex: 0 0 auto; color: var(--subtle-foreground); }
.compose-input input, .compose-input select { width: 100%; min-width: 0; height: 42px; border: 0; outline: 0; color: var(--foreground); background: transparent; }
.compose-select > svg:last-child { pointer-events: none; }
.sender-preview { margin-block-start: 12px; padding: 9px 11px; display: flex; align-items: center; gap: 10px; border: 1px solid color-mix(in oklch, var(--warning) 30%, var(--border)); border-radius: var(--radius-control); color: var(--warning); background: var(--warning-soft); }
.sender-preview--valid { border-color: color-mix(in oklch, var(--success) 30%, var(--border)); color: var(--success); background: var(--success-soft); }
.sender-preview > span { min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.sender-preview small { font-size: .6875rem; }
.sender-preview strong { overflow-wrap: anywhere; color: var(--foreground); font-size: .8125rem; }
.sender-fallback { margin-block-start: 10px; display: flex; gap: 7px; color: var(--warning); font-size: .75rem; }
.domain-empty { margin-block-start: 12px; padding: 11px 12px; display: flex; align-items: flex-start; gap: 9px; border: 1px solid color-mix(in oklch, var(--destructive) 30%, var(--border)); border-radius: var(--radius-control); color: var(--destructive); background: var(--destructive-soft); font-size: .75rem; }
.domain-empty svg { flex: 0 0 auto; }
.domain-empty span { display: grid; gap: 2px; }
.domain-empty strong { color: var(--foreground); font-size: .8125rem; }
.message-fields { padding: 8px 24px 0; }
.recipient-row, .subject-row { min-height: 54px; display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; align-items: center; gap: 8px; border-block-end: 1px solid var(--border); }
.subject-row { grid-template-columns: 72px minmax(0, 1fr); }
.recipient-row label, .subject-row label { color: var(--muted-foreground); font-size: .8125rem; font-weight: 650; }
.recipient-row :deep(.el-input-tag__wrapper) { min-height: 44px; padding-inline: 0; box-shadow: none !important; border-radius: 0 !important; }
.subject-row input { width: 100%; height: 50px; border: 0; outline: 0; color: var(--foreground); background: transparent; }
.compose-error { margin: 4px 0 0 80px; color: var(--destructive); font-size: .75rem; }
.compose-error--body { margin: 0 24px 8px; }
.editor-section { height: max(260px, calc(100% - 120px)); min-height: 260px; padding: 6px 18px 0; }
.attachments { padding: 10px 24px 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
.attachment-item { min-width: 0; min-height: 52px; padding: 4px 4px 4px 12px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--surface-subtle); }
.attachment-item > svg { color: var(--muted-foreground); }
.attachment-item span { min-width: 0; display: grid; }
.attachment-item strong { overflow: hidden; font-size: .75rem; text-overflow: ellipsis; white-space: nowrap; }
.attachment-item small { color: var(--muted-foreground); font-size: .6875rem; }
.compose-footer { min-height: 68px; padding: 10px 14px 10px 18px; display: grid; grid-template-columns: auto minmax(100px, 1fr) auto; align-items: center; gap: 12px; border-block-start: 1px solid var(--border); background: var(--surface); }
.compose-footer__tools, .compose-footer__actions { display: flex; align-items: center; gap: 4px; }
.compose-footer__actions { justify-content: flex-end; }
.draft-status { min-width: 0; display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--muted-foreground); font-size: .75rem; }
.draft-status span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.discard-action { min-height: 44px; padding-inline: 10px; display: inline-flex; align-items: center; gap: 7px; border-radius: var(--radius-control); color: var(--destructive); background: transparent; font-weight: 650; cursor: pointer; }
.discard-action:hover { background: var(--destructive-soft); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.spin { animation: spin .8s linear infinite; }
.contacts-dialog { min-height: 360px; position: relative; }
.contacts-empty { position: absolute; inset: 50% auto auto 50%; display: grid; justify-items: center; gap: 8px; color: var(--muted-foreground); transform: translate(-50%, -50%); }
.contacts-actions { margin-block-start: 16px; display: flex; justify-content: space-between; }
.contact-email { overflow-wrap: anywhere; }
@keyframes fade-in { from { opacity: 0; } }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 767px) {
  .compose-dialog { inset: 0; width: 100vw; height: 100dvh; padding-block: env(safe-area-inset-top) env(safe-area-inset-bottom); border: 0; border-radius: 0; transform: none; }
  .compose-header { min-height: 60px; padding: 8px 8px 8px 16px; }
  .compose-header p { display: none; }
  .sender-section { padding: 0; }
  .sender-mobile-summary { width: 100%; min-height: 60px; padding: 8px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--foreground); background: var(--surface-subtle); text-align: start; cursor: pointer; }
  .sender-mobile-summary > span { min-width: 0; display: grid; }
  .sender-mobile-summary strong { font-size: .875rem; }
  .sender-mobile-summary small { overflow: hidden; color: var(--muted-foreground); font-size: .75rem; text-overflow: ellipsis; white-space: nowrap; }
  .sender-mobile-summary > svg { flex: 0 0 auto; transition: transform var(--motion-base) var(--ease-out); }
  .sender-section--expanded .sender-mobile-summary > svg { transform: rotate(180deg); }
  .sender-section__content { display: none; padding: 4px 16px 16px; }
  .sender-section--expanded .sender-section__content { display: block; }
  .sender-section__heading { align-items: flex-start; flex-direction: column; gap: 10px; }
  .sender-section__heading > div { display: none; }
  .recent-sender { width: 100%; max-width: none; }
  .sender-grid { grid-template-columns: 1fr; }
  .message-fields { padding-inline: 16px; }
  .recipient-row, .subject-row { grid-template-columns: 62px minmax(0, 1fr) auto; }
  .subject-row { grid-template-columns: 62px minmax(0, 1fr); }
  .recipient-row :deep(.el-tag) { min-height: 36px; }
  .recipient-row :deep(.el-tag__close) { width: 32px; height: 32px; flex: 0 0 32px; }
  .compose-error { margin-inline-start: 70px; }
  .editor-section { padding-inline: 10px; }
  .attachments { padding-inline: 16px; grid-template-columns: 1fr; }
  .compose-footer { min-height: 64px; grid-template-columns: auto minmax(0, 1fr) auto; padding-inline: 8px; }
  .draft-status { justify-content: flex-start; }
  .discard-action span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
}
@media (max-width: 430px) {
  .compose-footer__tools > :nth-child(2), .draft-status svg { display: none; }
  .draft-status { font-size: .6875rem; }
}
</style>
