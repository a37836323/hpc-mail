<template>
  <div class="api-tester" role="tabpanel">
    <header class="tester-heading">
      <div>
        <h3>{{ t('apiKeyTesterTitle') }}</h3>
        <p>{{ t('apiKeyTesterDescription') }}</p>
      </div>
      <span class="memory-badge"><ShieldCheck :size="16" />{{ t('apiKeyMemoryOnly') }}</span>
    </header>

    <section class="tester-auth">
      <label for="api-test-key">{{ t('apiKey') }}</label>
      <div class="key-input-row">
        <el-input
          id="api-test-key"
          v-model="apiKey"
          type="password"
          show-password
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('apiKeyTesterPlaceholder')"
          @keyup.enter="testConnection"
        />
        <AppButton :loading="loading === 'status'" :disabled="!apiKey.trim()" @click="testConnection">
          {{ t('testApiKey') }}
        </AppButton>
      </div>
    </section>

    <div class="tester-grid">
      <section class="operation-card">
        <div class="operation-card__heading">
          <Inbox :size="20" />
          <div><h4>{{ t('testInbox') }}</h4><p>{{ t('testInboxDescription') }}</p></div>
        </div>
        <label>
          <span>{{ t('mailboxFilter') }}</span>
          <el-select v-model="mailboxId" :placeholder="t('allMailboxes')">
            <el-option :label="t('allMailboxes')" value="" />
            <el-option v-for="mailbox in mailboxes" :key="mailbox.id" :label="mailbox.address" :value="String(mailbox.id)" />
          </el-select>
        </label>
        <div class="operation-actions">
          <AppButton variant="secondary" :loading="loading === 'resources'" :disabled="!apiKey.trim()" @click="loadResources">
            {{ t('loadApiOptions') }}
          </AppButton>
          <AppButton :loading="loading === 'inbox'" :disabled="!apiKey.trim()" @click="testInbox">
            {{ t('viewInbox') }}
          </AppButton>
        </div>
      </section>

      <section class="operation-card operation-card--send">
        <div class="operation-card__heading">
          <Send :size="20" />
          <div><h4>{{ t('testSendMail') }}</h4><p>{{ t('testSendMailDescription') }}</p></div>
        </div>
        <fieldset class="sender-mode">
          <legend>{{ t('senderType') }}</legend>
          <el-radio-group v-model="sendForm.senderType">
            <el-radio-button value="mailbox">{{ t('registeredMailbox') }}</el-radio-button>
            <el-radio-button value="dynamic">{{ t('dynamicSender') }}</el-radio-button>
          </el-radio-group>
        </fieldset>
        <label v-if="sendForm.senderType === 'mailbox'">
          <span>{{ t('senderMailbox') }}</span>
          <el-select v-model="sendForm.mailboxId" :placeholder="t('selectSenderMailbox')">
            <el-option v-for="mailbox in mailboxes" :key="mailbox.id" :label="mailbox.address" :value="String(mailbox.id)" />
          </el-select>
        </label>
        <div v-else class="dynamic-sender">
          <label><span>{{ t('emailPrefix') }}</span><el-input v-model.trim="sendForm.localPart" placeholder="notice" /></label>
          <label><span>{{ t('emailDomain') }}</span><el-select v-model="sendForm.domain" :placeholder="t('selectDomain')"><el-option v-for="domain in domains" :key="domain" :label="`@${domain}`" :value="domain" /></el-select></label>
        </div>
        <label><span>{{ t('recipientAddresses') }}</span><el-input v-model="sendForm.to" :placeholder="t('recipientAddressesPlaceholder')" /></label>
        <label><span>{{ t('subject') }}</span><el-input v-model="sendForm.subject" maxlength="998" /></label>
        <label><span>{{ t('plainTextBody') }}</span><el-input v-model="sendForm.text" type="textarea" :rows="3" /></label>
        <AppButton :loading="loading === 'send'" :disabled="!canSend" @click="testSend">
          {{ t('sendTestEmail') }}
        </AppButton>
      </section>
    </div>

    <section v-if="result" class="tester-result" aria-live="polite">
      <header>
        <div>
          <span class="http-status" :class="{ 'http-status--error': !result.ok }">HTTP {{ result.status }}</span>
          <strong>{{ result.method }} {{ result.path }}</strong>
        </div>
        <dl>
          <div><dt>{{ t('apiDuration') }}</dt><dd>{{ result.duration }} ms</dd></div>
          <div><dt>{{ t('requestId') }}</dt><dd>{{ result.requestId || '—' }}</dd></div>
          <div><dt>{{ t('rateLimitRemaining') }}</dt><dd>{{ result.rateRemaining || '—' }}</dd></div>
        </dl>
      </header>
      <pre><code>{{ result.body }}</code></pre>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { Inbox, Send, ShieldCheck } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AppButton from '@/components/ui/AppButton.vue'

const { t } = useI18n()
const apiKey = ref('')
const loading = ref('')
const mailboxes = ref([])
const domains = ref([])
const mailboxId = ref('')
const result = ref(null)
const sendForm = reactive({
  senderType: 'mailbox',
  mailboxId: '',
  localPart: '',
  domain: '',
  to: '',
  subject: t('apiTestDefaultSubject'),
  text: t('apiTestDefaultBody')
})

const canSend = computed(() => {
  const hasSender = sendForm.senderType === 'mailbox'
    ? Boolean(sendForm.mailboxId)
    : Boolean(sendForm.localPart && sendForm.domain)
  return Boolean(apiKey.value.trim() && hasSender && sendForm.to.trim() && sendForm.subject.trim())
})

defineExpose({
  useKey(secret) {
    apiKey.value = String(secret || '')
  }
})

onBeforeUnmount(clearSensitiveState)

function clearSensitiveState() {
  apiKey.value = ''
  result.value = null
}

async function apiRequest(path, options = {}) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15000)
  const startedAt = performance.now()
  const method = options.method || 'GET'
  try {
    const response = await window.fetch(`${window.location.origin}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey.value.trim()}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    })
    const text = await response.text()
    let formatted = text
    try { formatted = JSON.stringify(JSON.parse(text), null, 2) } catch (_) { /* keep plain response */ }
    result.value = {
      ok: response.ok,
      status: response.status,
      method,
      path,
      duration: Math.round(performance.now() - startedAt),
      requestId: response.headers.get('X-Request-ID'),
      rateRemaining: response.headers.get('X-RateLimit-Remaining'),
      body: formatted.slice(0, 12000) || '(empty response)'
    }
    if (!response.ok) throw new Error(formatted || `HTTP ${response.status}`)
    return text ? JSON.parse(text) : {}
  } catch (error) {
    if (error?.name === 'AbortError') {
      result.value = { ok: false, status: t('timeout'), method, path, duration: 15000, requestId: '', rateRemaining: '', body: t('apiRequestTimedOut') }
    } else if (!result.value || result.value.path !== path) {
      result.value = { ok: false, status: t('networkError'), method, path, duration: Math.round(performance.now() - startedAt), requestId: '', rateRemaining: '', body: String(error?.message || error) }
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

async function run(type, task) {
  if (!apiKey.value.trim()) return
  loading.value = type
  try {
    await task()
  } catch (_) {
    // The structured error response is already visible in the result panel.
  } finally {
    loading.value = ''
  }
}

function testConnection() {
  return run('status', async () => {
    await apiRequest('/status')
    ElMessage.success(t('apiKeyTestSucceeded'))
  })
}

function loadResources() {
  return run('resources', async () => {
    let loaded = 0
    try {
      const mailboxResponse = await apiRequest('/mailboxes?limit=30')
      mailboxes.value = mailboxResponse?.data?.items || []
      if (!sendForm.mailboxId && mailboxes.value.length) sendForm.mailboxId = String(mailboxes.value[0].id)
      loaded += 1
    } catch (_) {
      mailboxes.value = []
    }
    try {
      const domainResponse = await apiRequest('/domains')
      domains.value = domainResponse?.data?.items || []
      if (!sendForm.domain && domains.value.length) sendForm.domain = domains.value[0]
      loaded += 1
    } catch (_) {
      domains.value = []
    }
    if (loaded) ElMessage.success(t('apiOptionsLoaded'))
  })
}

function testInbox() {
  return run('inbox', async () => {
    const query = new URLSearchParams({ direction: 'received', limit: '20' })
    if (mailboxId.value) query.set('mailboxId', mailboxId.value)
    await apiRequest(`/messages?${query}`)
  })
}

async function testSend() {
  const recipients = sendForm.to.split(/[\s,;]+/).map(item => item.trim()).filter(Boolean)
  try {
    await ElMessageBox.confirm(
      t('confirmApiTestSend', { recipients: recipients.join(', ') }),
      t('sendTestEmail'),
      { type: 'warning', confirmButtonText: t('send'), cancelButtonText: t('cancel') }
    )
  } catch (_) {
    return
  }
  return run('send', async () => {
    const from = sendForm.senderType === 'mailbox'
      ? { mailboxId: Number(sendForm.mailboxId) }
      : { localPart: sendForm.localPart, domain: sendForm.domain }
    await apiRequest('/messages', {
      method: 'POST',
      body: { from, to: recipients, subject: sendForm.subject, text: sendForm.text }
    })
    ElMessage.success(t('apiTestMailSent'))
  })
}
</script>

<style scoped>
.api-tester { min-height: 0; padding: clamp(16px, 3vw, 28px); overflow-y: auto; display: grid; align-content: start; gap: 18px; }
.tester-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.tester-heading h3 { font-size: 1rem; }
.tester-heading p { margin-block-start: 4px; color: var(--muted-foreground); font-size: .8125rem; line-height: 1.5; }
.memory-badge { min-height: 30px; padding-inline: 10px; display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; color: var(--success); background: var(--success-soft); font-size: .75rem; font-weight: 700; white-space: nowrap; }
.tester-auth, .operation-card, .tester-result { border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--surface); }
.tester-auth { padding: 14px; display: grid; gap: 7px; }
.tester-auth label, .operation-card label > span, .sender-mode legend { color: var(--foreground); font-size: .75rem; font-weight: 700; }
.key-input-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.tester-grid { display: grid; grid-template-columns: minmax(280px, .8fr) minmax(360px, 1.2fr); align-items: start; gap: 14px; }
.operation-card { padding: 16px; display: grid; gap: 14px; }
.operation-card__heading { display: flex; gap: 10px; color: var(--primary); }
.operation-card__heading h4 { color: var(--foreground); font-size: .9375rem; }
.operation-card__heading p { margin-block-start: 3px; color: var(--muted-foreground); font-size: .75rem; line-height: 1.45; }
.operation-card label, .dynamic-sender label { min-width: 0; display: grid; gap: 6px; }
.operation-card :deep(.el-select) { width: 100%; }
.operation-actions { display: flex; justify-content: flex-end; gap: 8px; }
.sender-mode { padding: 0; border: 0; display: grid; gap: 7px; }
.sender-mode :deep(.el-radio-group) { display: grid; grid-template-columns: 1fr 1fr; }
.sender-mode :deep(.el-radio-button__inner) { width: 100%; }
.dynamic-sender { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.tester-result { overflow: hidden; }
.tester-result > header { padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-block-end: 1px solid var(--border); background: var(--surface-subtle); }
.tester-result > header > div { display: flex; align-items: center; gap: 9px; }
.tester-result strong { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .75rem; }
.tester-result dl { display: flex; gap: 16px; }
.tester-result dl div { display: grid; gap: 2px; }
.tester-result dt { color: var(--subtle-foreground); font-size: .625rem; text-transform: uppercase; }
.tester-result dd { max-width: 180px; overflow: hidden; font-size: .6875rem; text-overflow: ellipsis; white-space: nowrap; }
.tester-result pre { max-height: 320px; margin: 0; padding: 16px; overflow: auto; color: #e2e8f0; background: var(--code-background, #101827); font-size: .75rem; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.http-status { padding: 3px 7px; border-radius: 6px; color: var(--success); background: var(--success-soft); font-size: .6875rem; font-weight: 750; }
.http-status--error { color: var(--destructive); background: var(--destructive-soft); }

@media (max-width: 800px) {
  .tester-grid { grid-template-columns: 1fr; }
}

@media (max-width: 560px) {
  .api-tester { padding: 12px; }
  .tester-heading { flex-direction: column; }
  .key-input-row, .dynamic-sender { grid-template-columns: 1fr; }
  .key-input-row :deep(.el-input__wrapper), .operation-card :deep(.el-input__wrapper), .operation-card :deep(.el-select__wrapper) { min-height: 44px; }
  .operation-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .tester-result > header { align-items: flex-start; flex-direction: column; }
  .tester-result dl { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
}
</style>
