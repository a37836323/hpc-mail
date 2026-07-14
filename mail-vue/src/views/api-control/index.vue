<template>
  <section class="api-control" aria-labelledby="api-control-title">
    <header class="page-heading">
      <div>
        <h2 id="api-control-title">{{ $t('apiControl') }}</h2>
        <p>{{ $t('apiControlDescription') }}</p>
      </div>
      <AppButton v-perm="'api-key:add'" @click="openCreate">
        <template #icon><Plus :size="18" /></template>{{ $t('createApiKey') }}
      </AppButton>
    </header>

    <div class="overview-grid">
      <article class="service-card">
        <div class="service-card__head">
          <span class="status-icon" :class="{ 'status-icon--active': config.enabled }">
            <Power :size="20" aria-hidden="true" />
          </span>
          <div><h3>{{ $t('publicApi') }}</h3><p>{{ config.enabled ? $t('apiEnabledDescription') : $t('apiDisabledDescription') }}</p></div>
          <el-switch
              v-if="canSet"
              v-model="config.enabled"
              :loading="configLoading"
              :aria-label="$t('publicApi')"
              @change="toggleApi"
          />
          <span v-else class="status-pill" :class="config.enabled ? 'status-pill--active' : ''">
            {{ config.enabled ? $t('enabled') : $t('disabled') }}
          </span>
        </div>
        <div class="endpoint-row">
          <div><span>{{ $t('apiBaseUrl') }}</span><code>{{ apiBaseUrl }}</code></div>
          <IconButton :label="$t('copyApiBaseUrl')" variant="bordered" @click="copyText(apiBaseUrl)"><Copy :size="18" /></IconButton>
        </div>
      </article>

      <article class="metric-card"><KeyRound :size="19" /><span>{{ $t('activeApiKeys') }}</span><strong>{{ config.activeKeys }}</strong><small>{{ $t('totalApiKeys', { total: config.totalKeys }) }}</small></article>
      <article class="metric-card"><Activity :size="19" /><span>{{ $t('callsLast24Hours') }}</span><strong>{{ config.calls24h }}</strong><small>{{ $t('failedApiCalls', { total: config.errors24h }) }}</small></article>
    </div>

    <div class="content-card">
      <div class="content-card__toolbar">
        <div class="tabs" role="tablist" :aria-label="$t('apiControl')">
          <button type="button" role="tab" :aria-selected="activeTab === 'keys'" :class="{ active: activeTab === 'keys' }" @click="activeTab = 'keys'">
            <KeyRound :size="17" />{{ $t('apiKeys') }}
          </button>
          <button type="button" role="tab" :aria-selected="activeTab === 'audit'" :class="{ active: activeTab === 'audit' }" @click="openAudit">
            <ScrollText :size="17" />{{ $t('apiAudit') }}
          </button>
          <button type="button" role="tab" :aria-selected="activeTab === 'guide'" :class="{ active: activeTab === 'guide' }" @click="activeTab = 'guide'">
            <BookOpen :size="17" />{{ $t('quickStart') }}
          </button>
        </div>
        <div v-if="activeTab === 'keys'" class="filters">
          <el-input v-model="keyParams.search" clearable :placeholder="$t('searchApiKeys')" @keyup.enter="loadKeys(true)" />
          <el-select v-model="keyParams.status" :aria-label="$t('status')" @change="loadKeys(true)">
            <el-option :label="$t('all')" value="" />
            <el-option :label="$t('enabled')" :value="1" />
            <el-option :label="$t('disabled')" :value="0" />
            <el-option :label="$t('revoked')" :value="-1" />
          </el-select>
          <IconButton :label="$t('refresh')" variant="bordered" @click="loadAll"><RefreshCw :size="18" /></IconButton>
        </div>
        <div v-else-if="activeTab === 'audit'" class="filters">
          <IconButton :label="$t('refresh')" variant="bordered" @click="loadAudit"><RefreshCw :size="18" /></IconButton>
        </div>
      </div>

      <div v-if="activeTab === 'keys'" class="key-panel" role="tabpanel">
        <div v-loading="keysLoading" class="key-list">
          <article v-for="item in keys" :key="item.apiKeyId" class="key-card">
            <div class="key-card__main">
              <span class="key-mark"><KeyRound :size="18" /></span>
              <div class="key-title">
                <div><h3>{{ item.name }}</h3><span class="status-pill" :class="statusClass(item)">{{ statusLabel(item) }}</span></div>
                <code>{{ item.keyHint }}</code>
              </div>
            </div>
            <dl class="key-details">
              <div><dt>{{ $t('boundUser') }}</dt><dd>{{ item.displayName || item.username }} <small>@{{ item.username }}</small></dd></div>
              <div><dt>{{ $t('apiScopes') }}</dt><dd class="scope-list"><span v-for="scope in item.scopes" :key="scope">{{ scopeLabel(scope) }}</span></dd></div>
              <div><dt>{{ $t('rateLimit') }}</dt><dd>{{ $t('requestsPerMinute', { total: item.rateLimit }) }}</dd></div>
              <div><dt>{{ $t('lastUsed') }}</dt><dd>{{ item.lastUsedAt ? formatDate(item.lastUsedAt) : $t('neverUsed') }}<small v-if="item.lastUsedIp">{{ item.lastUsedIp }}</small></dd></div>
              <div><dt>{{ $t('expiresAt') }}</dt><dd>{{ item.expiresAt ? formatDate(item.expiresAt) : $t('neverExpires') }}</dd></div>
              <div><dt>{{ $t('ipWhitelist') }}</dt><dd>{{ item.allowedIps.length ? item.allowedIps.join(', ') : $t('allIpAddresses') }}</dd></div>
            </dl>
            <div class="key-card__actions">
              <span>{{ $t('createdAt') }} {{ formatDate(item.createTime) }}</span>
              <div>
                <el-switch
                    v-if="canSet && item.status !== -1"
                    :model-value="item.status === 1"
                    :disabled="isExpired(item)"
                    :aria-label="$t('toggleApiKey', { name: item.name })"
                    @change="setKeyStatus(item, $event)"
                />
                <AppButton v-if="canDelete && item.status !== -1" size="sm" variant="danger" @click="revokeKey(item)">{{ $t('revoke') }}</AppButton>
              </div>
            </div>
          </article>
          <el-empty v-if="!keysLoading && !keys.length" :description="$t('noApiKeys')" />
        </div>
        <el-pagination
            v-if="keyTotal > keyParams.size"
            v-model:current-page="keyParams.page"
            :page-size="keyParams.size"
            :total="keyTotal"
            layout="prev, pager, next"
            @current-change="loadKeys"
        />
      </div>

      <div v-else-if="activeTab === 'audit'" v-loading="auditLoading" class="audit-panel" role="tabpanel">
        <el-table :data="auditRows" height="100%">
          <el-table-column prop="createTime" :label="$t('date')" min-width="168"><template #default="{ row }">{{ formatDate(row.createTime) }}</template></el-table-column>
          <el-table-column prop="keyName" :label="$t('apiKey')" min-width="150" show-overflow-tooltip />
          <el-table-column prop="method" :label="$t('method')" width="88"><template #default="{ row }"><code>{{ row.method }}</code></template></el-table-column>
          <el-table-column prop="path" :label="$t('endpoint')" min-width="210" show-overflow-tooltip />
          <el-table-column prop="statusCode" :label="$t('status')" width="90"><template #default="{ row }"><span class="http-status" :class="{ 'http-status--error': row.statusCode >= 400 }">{{ row.statusCode }}</span></template></el-table-column>
          <el-table-column prop="ip" label="IP" min-width="140" show-overflow-tooltip />
          <el-table-column prop="durationMs" :label="$t('apiDuration')" width="100"><template #default="{ row }">{{ row.durationMs }} ms</template></el-table-column>
          <el-table-column prop="requestId" :label="$t('requestId')" min-width="220" show-overflow-tooltip />
        </el-table>
        <el-empty v-if="!auditLoading && !auditRows.length" :description="$t('noApiAudit')" />
        <el-pagination
            v-if="auditTotal > auditParams.size"
            v-model:current-page="auditParams.page"
            :page-size="auditParams.size"
            :total="auditTotal"
            layout="prev, pager, next"
            @current-change="loadAudit"
        />
      </div>

      <div v-else class="guide-panel" role="tabpanel">
        <div class="guide-copy">
          <span class="guide-icon"><TerminalSquare :size="22" /></span>
          <div><h3>{{ $t('apiQuickStartTitle') }}</h3><p>{{ $t('apiQuickStartDescription') }}</p></div>
        </div>
        <ol class="guide-steps">
          <li><span>1</span><div><strong>{{ $t('createApiKey') }}</strong><p>{{ $t('createApiKeyGuide') }}</p></div></li>
          <li><span>2</span><div><strong>{{ $t('saveApiKeySecurely') }}</strong><p>{{ $t('apiKeyShownOnce') }}</p></div></li>
          <li><span>3</span><div><strong>{{ $t('callApi') }}</strong><p>{{ $t('callApiGuide') }}</p></div></li>
        </ol>
        <div class="code-sample">
          <div><span>cURL</span><IconButton :label="$t('copy')" @click="copyText(curlExample)"><Copy :size="17" /></IconButton></div>
          <pre><code>{{ curlExample }}</code></pre>
        </div>
        <div class="endpoint-list">
          <div><code>GET</code><strong>/status</strong><span>{{ $t('endpointStatusDescription') }}</span></div>
          <div><code>GET</code><strong>/mailboxes</strong><span>{{ $t('endpointMailboxesDescription') }}</span></div>
          <div><code>GET</code><strong>/messages</strong><span>{{ $t('endpointMessagesDescription') }}</span></div>
          <div><code>POST</code><strong>/messages</strong><span>{{ $t('endpointSendDescription') }}</span></div>
        </div>
      </div>
    </div>

    <el-dialog v-model="createVisible" class="api-key-dialog" :title="$t('createApiKey')" width="560px" destroy-on-close>
      <form class="create-form" @submit.prevent="createKey">
        <label><span>{{ $t('apiKeyName') }}</span><el-input v-model.trim="createForm.name" maxlength="50" :placeholder="$t('apiKeyNamePlaceholder')" /></label>
        <label><span>{{ $t('boundUser') }}</span><el-select v-model="createForm.userId" filterable :placeholder="$t('selectUser')"><el-option v-for="user in users" :key="user.userId" :value="user.userId" :label="user.displayName ? `${user.displayName} (@${user.username})` : user.username" /></el-select></label>
        <fieldset><legend>{{ $t('apiScopes') }}</legend><el-checkbox-group v-model="createForm.scopes"><el-checkbox v-for="scope in scopeOptions" :key="scope.value" :value="scope.value"><span class="scope-option"><strong>{{ scope.label }}</strong><small>{{ scope.description }}</small></span></el-checkbox></el-checkbox-group></fieldset>
        <div class="form-grid">
          <label><span>{{ $t('rateLimitPerMinute') }}</span><el-input-number v-model="createForm.rateLimit" :min="1" :max="1000" controls-position="right" /></label>
          <label><span>{{ $t('expiresAtOptional') }}</span><el-date-picker v-model="createForm.expiresAt" type="datetime" :placeholder="$t('neverExpires')" /></label>
        </div>
        <label><span>{{ $t('ipWhitelistOptional') }}</span><el-input v-model="createForm.allowedIps" type="textarea" :rows="3" :placeholder="$t('ipWhitelistPlaceholder')" /><small>{{ $t('ipWhitelistHint') }}</small></label>
        <div class="dialog-actions"><AppButton type="button" variant="secondary" @click="createVisible = false">{{ $t('cancel') }}</AppButton><AppButton type="submit" :loading="createLoading">{{ $t('create') }}</AppButton></div>
      </form>
    </el-dialog>

    <el-dialog v-model="secretVisible" class="api-key-dialog" :title="$t('apiKeyCreated')" width="560px" :close-on-click-modal="false" @closed="createdSecret = ''">
      <div class="secret-result">
        <div class="secret-warning"><TriangleAlert :size="20" /><div><strong>{{ $t('copyApiKeyNow') }}</strong><p>{{ $t('apiKeyShownOnce') }}</p></div></div>
        <div class="secret-value"><code>{{ createdSecret }}</code><IconButton :label="$t('copyApiKey')" variant="bordered" @click="copyText(createdSecret)"><Copy :size="18" /></IconButton></div>
        <AppButton class="copy-secret-button" @click="copyText(createdSecret)"><template #icon><Copy :size="18" /></template>{{ $t('copyApiKey') }}</AppButton>
      </div>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Activity, BookOpen, Copy, KeyRound, Plus, Power, RefreshCw, ScrollText, TerminalSquare, TriangleAlert } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AppButton from '@/components/ui/AppButton.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { hasPerm } from '@/perm/perm.js'
import { tzDayjs } from '@/utils/day.js'
import { apiAuditList, apiConfig, apiKeyCreate, apiKeyList, apiKeyRevoke, apiKeySetStatus, apiSetConfig, apiUsers } from '@/request/api-control.js'

defineOptions({ name: 'api-control' })

const { t } = useI18n()
const activeTab = ref('keys')
const configLoading = ref(false)
const keysLoading = ref(false)
const auditLoading = ref(false)
const createLoading = ref(false)
const createVisible = ref(false)
const secretVisible = ref(false)
const createdSecret = ref('')
const keys = ref([])
const users = ref([])
const auditRows = ref([])
const keyTotal = ref(0)
const auditTotal = ref(0)
const config = reactive({ enabled: false, activeKeys: 0, totalKeys: 0, calls24h: 0, errors24h: 0 })
const keyParams = reactive({ page: 1, size: 20, search: '', status: '' })
const auditParams = reactive({ page: 1, size: 30 })
const createForm = reactive({ name: '', userId: null, scopes: ['mail.read'], rateLimit: 60, expiresAt: null, allowedIps: '' })
const apiBaseUrl = `${window.location.origin}/api/v1`
const canSet = computed(() => hasPerm('api-key:set'))
const canDelete = computed(() => hasPerm('api-key:delete'))
const scopeOptions = computed(() => [
  { value: 'mail.read', label: t('scopeMailRead'), description: t('scopeMailReadDescription') },
  { value: 'mail.send', label: t('scopeMailSend'), description: t('scopeMailSendDescription') },
  { value: 'mailbox.read', label: t('scopeMailboxRead'), description: t('scopeMailboxReadDescription') },
])
const curlExample = computed(() => `curl ${apiBaseUrl}/status \\\n  -H "Authorization: Bearer hpc_live_your_api_key"`)

onMounted(loadAll)

async function loadAll() {
  await Promise.all([loadConfig(), loadKeys(), loadUsers()])
}

async function loadConfig() {
  Object.assign(config, await apiConfig())
}

async function loadUsers() {
  users.value = await apiUsers()
}

async function loadKeys(reset = false) {
  if (reset) keyParams.page = 1
  keysLoading.value = true
  try {
    const data = await apiKeyList(keyParams)
    keys.value = data.list
    keyTotal.value = data.total
  } finally {
    keysLoading.value = false
  }
}

async function toggleApi(enabled) {
  configLoading.value = true
  try {
    Object.assign(config, await apiSetConfig(enabled))
    ElMessage.success(enabled ? t('apiEnabled') : t('apiDisabled'))
  } catch (error) {
    config.enabled = !enabled
  } finally {
    configLoading.value = false
  }
}

function openCreate() {
  Object.assign(createForm, { name: '', userId: users.value[0]?.userId || null, scopes: ['mail.read'], rateLimit: 60, expiresAt: null, allowedIps: '' })
  createVisible.value = true
}

async function createKey() {
  if (!createForm.name || !createForm.userId || !createForm.scopes.length) {
    ElMessage.warning(t('completeApiKeyForm'))
    return
  }
  createLoading.value = true
  try {
    const data = await apiKeyCreate({
      ...createForm,
      expiresAt: createForm.expiresAt ? new Date(createForm.expiresAt).toISOString() : null,
      allowedIps: createForm.allowedIps.split(/[\s,]+/).filter(Boolean)
    })
    createdSecret.value = data.secret
    createVisible.value = false
    secretVisible.value = true
    await Promise.all([loadKeys(true), loadConfig()])
  } finally {
    createLoading.value = false
  }
}

async function setKeyStatus(item, enabled) {
  const updated = await apiKeySetStatus(item.apiKeyId, enabled ? 1 : 0)
  Object.assign(item, updated)
  await loadConfig()
  ElMessage.success(enabled ? t('apiKeyEnabled') : t('apiKeyDisabled'))
}

async function revokeKey(item) {
  await ElMessageBox.confirm(t('revokeApiKeyConfirm', { name: item.name }), t('revokeApiKey'), { type: 'warning', confirmButtonText: t('revoke'), cancelButtonText: t('cancel') })
  await apiKeyRevoke(item.apiKeyId)
  ElMessage.success(t('apiKeyRevoked'))
  await Promise.all([loadKeys(), loadConfig()])
}

async function openAudit() {
  activeTab.value = 'audit'
  if (!auditRows.value.length) await loadAudit()
}

async function loadAudit() {
  auditLoading.value = true
  try {
    const data = await apiAuditList(auditParams)
    auditRows.value = data.list
    auditTotal.value = data.total
  } finally {
    auditLoading.value = false
  }
}

function isExpired(item) {
  return Boolean(item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now())
}

function statusLabel(item) {
  if (item.status === -1) return t('revoked')
  if (isExpired(item)) return t('expired')
  return item.status === 1 ? t('enabled') : t('disabled')
}

function statusClass(item) {
  if (item.status === -1 || isExpired(item)) return 'status-pill--danger'
  return item.status === 1 ? 'status-pill--active' : ''
}

function scopeLabel(scope) {
  return ({ 'mail.read': t('scopeMailRead'), 'mail.send': t('scopeMailSend'), 'mailbox.read': t('scopeMailboxRead') })[scope] || scope
}

function formatDate(value) {
  return tzDayjs(value).format('YYYY-MM-DD HH:mm')
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(t('copySuccessMsg'))
  } catch (_) {
    ElMessage.error(t('copyFailMsg'))
  }
}
</script>

<style scoped>
.api-control { height: 100%; padding: clamp(14px, 2.5vw, 24px); display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 16px; overflow: hidden; background: var(--background); }
.page-heading { min-width: 0; display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
.page-heading h2 { color: var(--foreground); font-size: 1.25rem; letter-spacing: -.02em; }
.page-heading p { margin-block-start: 4px; color: var(--muted-foreground); font-size: .8125rem; }
.overview-grid { display: grid; grid-template-columns: minmax(360px, 1.7fr) minmax(170px, .65fr) minmax(170px, .65fr); gap: 12px; }
.service-card, .metric-card, .content-card { border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--surface); box-shadow: var(--shadow-card); }
.service-card { padding: 16px; display: grid; gap: 14px; }
.service-card__head { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; }
.service-card h3 { font-size: .9375rem; }
.service-card p { margin-block-start: 2px; color: var(--muted-foreground); font-size: .75rem; }
.status-icon { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; color: var(--muted-foreground); background: var(--surface-subtle); }
.status-icon--active { color: var(--success); background: var(--success-soft); }
.endpoint-row { min-width: 0; padding: 10px 10px 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--surface-subtle); }
.endpoint-row > div { min-width: 0; display: grid; gap: 2px; }
.endpoint-row span { color: var(--subtle-foreground); font-size: .6875rem; font-weight: 700; text-transform: uppercase; }
.endpoint-row code { overflow: hidden; color: var(--foreground); font-size: .8125rem; text-overflow: ellipsis; white-space: nowrap; }
.metric-card { padding: 16px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-content: center; gap: 5px 8px; }
.metric-card > svg { color: var(--primary); }
.metric-card span { color: var(--muted-foreground); font-size: .75rem; font-weight: 650; }
.metric-card strong { grid-column: 1 / -1; font-size: 1.75rem; letter-spacing: -.04em; }
.metric-card small { grid-column: 1 / -1; color: var(--subtle-foreground); }
.content-card { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
.content-card__toolbar { min-width: 0; min-height: 64px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-block-end: 1px solid var(--border); }
.tabs { padding: 3px; display: flex; gap: 2px; border-radius: var(--radius-control); background: var(--surface-subtle); }
.tabs button { min-height: 38px; padding-inline: 12px; display: inline-flex; align-items: center; gap: 7px; border-radius: calc(var(--radius-control) - 3px); color: var(--muted-foreground); font-weight: 650; cursor: pointer; }
.tabs button.active { color: var(--foreground); background: var(--surface); box-shadow: var(--shadow-sm); }
.filters { min-width: 0; display: flex; align-items: center; gap: 6px; }
.filters :deep(.el-input) { width: 210px; }
.filters :deep(.el-select) { width: 110px; }
.key-panel { min-height: 0; padding: 14px; display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 10px; overflow: hidden; }
.key-list { min-height: 0; overflow-y: auto; display: grid; align-content: start; gap: 10px; }
.key-card { border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--surface); overflow: hidden; }
.key-card__main { padding: 15px 16px 12px; display: flex; align-items: center; gap: 11px; }
.key-mark { width: 38px; height: 38px; flex: 0 0 38px; display: grid; place-items: center; border-radius: 11px; color: var(--primary); background: var(--primary-soft); }
.key-title { min-width: 0; display: grid; gap: 3px; }
.key-title > div { display: flex; align-items: center; gap: 8px; }
.key-title h3 { font-size: .9375rem; }
.key-title code { color: var(--muted-foreground); font-size: .75rem; }
.status-pill { min-height: 22px; padding-inline: 8px; display: inline-flex; align-items: center; border-radius: 999px; color: var(--muted-foreground); background: var(--surface-subtle); font-size: .6875rem; font-weight: 750; }
.status-pill--active { color: var(--success); background: var(--success-soft); }
.status-pill--danger { color: var(--destructive); background: var(--destructive-soft); }
.key-details { padding: 0 16px 14px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 20px; }
.key-details > div { min-width: 0; display: grid; gap: 4px; }
.key-details dt { color: var(--subtle-foreground); font-size: .6875rem; font-weight: 700; text-transform: uppercase; }
.key-details dd { min-width: 0; overflow: hidden; color: var(--foreground); font-size: .8125rem; text-overflow: ellipsis; white-space: nowrap; }
.key-details dd small { margin-inline-start: 5px; color: var(--subtle-foreground); }
.scope-list { display: flex !important; gap: 4px; }
.scope-list span { padding: 3px 6px; border-radius: 6px; color: var(--primary); background: var(--primary-soft); font-size: .6875rem; }
.key-card__actions { min-height: 54px; padding: 6px 10px 6px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-block-start: 1px solid var(--border); background: var(--surface-subtle); }
.key-card__actions > span { color: var(--subtle-foreground); font-size: .6875rem; }
.key-card__actions > div { display: flex; align-items: center; gap: 10px; }
.audit-panel { min-height: 0; padding: 12px; display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 10px; }
.http-status { padding: 3px 7px; border-radius: 6px; color: var(--success); background: var(--success-soft); font-weight: 750; }
.http-status--error { color: var(--destructive); background: var(--destructive-soft); }
.guide-panel { min-height: 0; padding: clamp(18px, 3vw, 32px); overflow-y: auto; display: grid; align-content: start; gap: 22px; }
.guide-copy { display: flex; gap: 12px; }
.guide-copy h3 { font-size: 1rem; }
.guide-copy p { margin-block-start: 4px; color: var(--muted-foreground); font-size: .8125rem; }
.guide-icon { width: 44px; height: 44px; flex: 0 0 44px; display: grid; place-items: center; border-radius: 12px; color: var(--primary); background: var(--primary-soft); }
.guide-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; list-style: none; }
.guide-steps li { display: flex; gap: 10px; }
.guide-steps li > span { width: 26px; height: 26px; flex: 0 0 26px; display: grid; place-items: center; border-radius: 50%; color: var(--primary); background: var(--primary-soft); font-size: .75rem; font-weight: 750; }
.guide-steps strong { font-size: .8125rem; }
.guide-steps p { margin-block-start: 3px; color: var(--muted-foreground); font-size: .75rem; line-height: 1.5; }
.code-sample { border: 1px solid var(--border); border-radius: var(--radius-card); overflow: hidden; background: var(--code-background, #101827); }
.code-sample > div { min-height: 42px; padding-inline: 14px 6px; display: flex; align-items: center; justify-content: space-between; color: #cbd5e1; border-block-end: 1px solid rgba(255,255,255,.1); }
.code-sample pre { margin: 0; padding: 18px; overflow-x: auto; color: #e2e8f0; font-size: .8125rem; }
.endpoint-list { display: grid; gap: 1px; border: 1px solid var(--border); border-radius: var(--radius-card); overflow: hidden; background: var(--border); }
.endpoint-list > div { min-height: 50px; padding-inline: 14px; display: grid; grid-template-columns: 56px 130px minmax(0, 1fr); align-items: center; gap: 10px; background: var(--surface); }
.endpoint-list code { color: var(--primary); font-size: .75rem; font-weight: 750; }
.endpoint-list strong { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8125rem; }
.endpoint-list span { color: var(--muted-foreground); font-size: .75rem; }
.create-form { display: grid; gap: 16px; }
.create-form > label, .form-grid label { min-width: 0; display: grid; gap: 7px; color: var(--foreground); font-size: .8125rem; font-weight: 650; }
.create-form label > small { color: var(--subtle-foreground); font-weight: 400; line-height: 1.45; }
.create-form :deep(.el-select), .create-form :deep(.el-date-editor), .create-form :deep(.el-input-number) { width: 100%; }
.create-form fieldset { padding: 0; border: 0; }
.create-form legend { margin-block-end: 8px; font-size: .8125rem; font-weight: 650; }
.create-form :deep(.el-checkbox-group) { display: grid; gap: 6px; }
.create-form :deep(.el-checkbox) { width: 100%; height: auto; min-height: 54px; margin: 0; padding: 8px 10px; align-items: flex-start; border: 1px solid var(--border); border-radius: var(--radius-control); }
.create-form :deep(.el-checkbox.is-checked) { border-color: var(--primary); background: var(--primary-soft); }
.scope-option { display: grid; gap: 2px; white-space: normal; }
.scope-option strong { color: var(--foreground); font-size: .8125rem; }
.scope-option small { color: var(--muted-foreground); font-size: .75rem; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dialog-actions { padding-block-start: 4px; display: flex; justify-content: flex-end; gap: 8px; }
.secret-result { display: grid; gap: 16px; }
.secret-warning { padding: 12px; display: flex; gap: 10px; border: 1px solid var(--warning); border-radius: var(--radius-control); color: var(--warning-foreground); background: var(--warning-soft); }
.secret-warning p { margin-block-start: 3px; font-size: .75rem; }
.secret-value { min-width: 0; padding: 10px 8px 10px 12px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--surface-subtle); }
.secret-value code { min-width: 0; overflow-wrap: anywhere; font-size: .75rem; }
.copy-secret-button { width: 100%; }

@media (max-width: 1000px) {
  .overview-grid { grid-template-columns: 1fr 1fr; }
  .service-card { grid-column: 1 / -1; }
  .key-details { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 767px) {
  .api-control { padding: 12px; gap: 12px; overflow-y: auto; grid-template-rows: auto auto auto; }
  .page-heading { align-items: center; }
  .page-heading p { display: none; }
  .overview-grid { grid-template-columns: 1fr 1fr; }
  .service-card { padding: 12px; }
  .metric-card { padding: 12px; }
  .metric-card strong { font-size: 1.4rem; }
  .content-card { min-height: 560px; }
  .content-card__toolbar { align-items: stretch; flex-direction: column; }
  .tabs { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); }
  .tabs button { min-height: 44px; padding-inline: 6px; justify-content: center; }
  .filters { overflow-x: auto; }
  .filters :deep(.el-input) { width: 170px; flex: 0 0 170px; }
  .filters :deep(.el-select) { width: 108px; flex: 0 0 108px; }
  .filters :deep(.el-input__wrapper), .filters :deep(.el-select__wrapper) { min-height: 44px; }
  .api-control :deep(.el-switch) { min-height: 44px; }
  .key-details { grid-template-columns: 1fr; }
  .key-card__actions { align-items: flex-start; flex-direction: column; padding: 10px 12px; }
  .key-card__actions > div { width: 100%; justify-content: space-between; }
  .guide-steps { grid-template-columns: 1fr; }
  .endpoint-list > div { grid-template-columns: 50px minmax(90px, auto) minmax(0, 1fr); }
  .form-grid { grid-template-columns: 1fr; }
  .create-form :deep(.el-input__wrapper), .create-form :deep(.el-select__wrapper), .create-form :deep(.el-input-number) { min-height: 44px; }
  :global(.api-key-dialog.el-dialog) { max-height: calc(100dvh - 24px); margin: 12px auto !important; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
  :global(.api-key-dialog .el-dialog__body) { min-height: 0; overflow-y: auto; }
}

@media (max-width: 420px) {
  .overview-grid { grid-template-columns: 1fr; }
  .service-card { grid-column: auto; }
  .service-card__head { grid-template-columns: auto minmax(0, 1fr); }
  .service-card__head > :last-child { grid-column: 1 / -1; justify-self: end; }
  .metric-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; }
  .metric-card strong { grid-column: 3; grid-row: 1 / span 2; }
  .metric-card small { grid-column: 2; }
  .endpoint-list > div { padding-block: 10px; grid-template-columns: 48px minmax(0, 1fr); }
  .endpoint-list span { grid-column: 1 / -1; }
}
</style>
