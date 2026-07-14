<template>
  <main class="message-page">
    <header class="message-toolbar" :aria-label="$t('messageActions')">
      <IconButton :label="$t('back')" @click="handleBack"><ArrowLeft :size="20" /></IconButton>
      <IconButton v-perm="'email:delete'" :label="$t('delete')" variant="danger" @click="handleDelete"><Trash2 :size="18" /></IconButton>
      <IconButton v-if="emailStore.contentData.showStar" :label="email.isStar ? $t('removeStar') : $t('star')" @click="changeStar">
        <Star :size="19" :fill="email.isStar ? 'currentColor' : 'none'" />
      </IconButton>
      <span class="toolbar-spacer" />
      <IconButton v-if="emailStore.contentData.showReply" v-perm="'email:send'" :label="$t('reply')" @click="openReply"><Reply :size="20" /></IconButton>
      <IconButton v-if="emailStore.contentData.showReply" v-perm="'email:send'" :label="$t('forward')" @click="openForward"><Forward :size="20" /></IconButton>
    </header>

    <el-scrollbar class="message-scrollbar">
      <article class="message-card">
        <header class="message-heading">
          <p class="message-heading__eyebrow">{{ $t('message') }}</p>
          <h2>{{ email.subject || $t('noSubject') }}</h2>
          <dl class="message-meta">
            <div><dt>{{ $t('from') }}</dt><dd><strong>{{ email.name || email.sendEmail }}</strong><span v-if="email.name">&lt;{{ email.sendEmail }}&gt;</span></dd></div>
            <div><dt>{{ $t('recipient') }}</dt><dd>{{ formateReceive(email.recipient) }}</dd></div>
            <div><dt>{{ $t('date') }}</dt><dd>{{ formatDetailDate(email.createTime) }}</dd></div>
          </dl>
          <el-alert v-if="email.status === 3" :closable="false" :title="toMessage(email.message)" class="email-msg" type="error" show-icon />
          <el-alert v-if="email.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon />
          <el-alert v-if="email.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon />
        </header>

        <section class="message-body" :aria-label="$t('messageBody')">
          <ShadowHtml v-if="email.content" class="shadow-html" :html="formatImage(email.content)" />
          <pre v-else class="email-text">{{ email.text }}</pre>
        </section>

        <section v-if="email.attList?.length" class="attachments-panel" :aria-labelledby="'attachments-title'">
          <div class="attachments-heading"><h3 id="attachments-title">{{ $t('attachments') }}</h3><span>{{ $t('attCount', { total: email.attList.length }) }}</span></div>
          <ul class="attachment-list">
            <li v-for="att in email.attList" :key="att.attId" class="attachment-row">
              <span class="attachment-type" aria-hidden="true"><Icon v-bind="getIconByName(att.filename)" /></span>
              <span class="attachment-name"><strong>{{ att.filename }}</strong><small>{{ formatBytes(att.size) }}</small></span>
              <IconButton v-if="isImage(att.filename)" :label="$t('previewAttachment', { name: att.filename })" @click="showImage(att.key)"><Eye :size="19" /></IconButton>
              <a class="attachment-download" :href="cvtR2Url(att.key)" download :aria-label="$t('downloadAttachment', { name: att.filename })"><Download :size="19" /></a>
            </li>
          </ul>
        </section>
      </article>
    </el-scrollbar>
    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="showPreview = false"
    />
  </main>
</template>
<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import {reactive, ref, watch, onMounted, onUnmounted} from "vue";
import {useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {emailDelete, emailRead} from "@/request/email.js";
import {Icon} from "@iconify/vue";
import { ArrowLeft, Download, Eye, Forward, Reply, Star, Trash2 } from '@lucide/vue'
import IconButton from '@/components/ui/IconButton.vue'
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {formatDetailDate} from "@/utils/day.js";
import {starAdd, starCancel} from "@/request/star.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";
import {cvtR2Url,toOssDomain} from "@/utils/convert.js";
import {getIconByName} from "@/utils/icon-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";

const uiStore = useUiStore();
const settingStore = useSettingStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const router = useRouter()
const email = emailStore.contentData.email
const showPreview = ref(false)
const srcList = reactive([])

const { t } = useI18n()
watch(() => accountStore.currentAccountId, () => {
  handleBack()
})

onMounted(() => {
  if (emailStore.contentData.showUnread && email.unread === EmailUnreadEnum.UNREAD) {
    email.unread = EmailUnreadEnum.READ;
    emailRead([email.emailId]);
  }
})

onUnmounted(() => {
  emailStore.contentData.showUnread = false;
})

function openReply() {
  uiStore.writerRef.openReply(email)
}

function openForward() {
  uiStore.writerRef.openForward(email)
}

function toMessage(message) {
  return  message ? JSON.parse(message).message : '';
}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return  content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function showImage(key) {
  if (!isImage(key)) return;
  const url = cvtR2Url(key)
  srcList.length = 0
  srcList.push(url)
  showPreview.value = true
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  try {
    const parsed = typeof recipient === 'string' ? JSON.parse(recipient) : recipient
    return Array.isArray(parsed) ? parsed.map(item => item.address || item).join(', ') : String(parsed || '—')
  } catch {
    return String(recipient || '—')
  }
}

function changeStar() {
  if (email.isStar) {
    email.isStar = 0;
    starCancel(email.emailId).then(() => {
      email.isStar = 0;
      emailStore.cancelStarEmailId = email.emailId
      setTimeout(() => emailStore.cancelStarEmailId = 0)
      emailStore.starScroll?.deleteEmail([email.emailId])
    }).catch((e) => {
      console.error(e)
      email.isStar = 1;
    })
  } else {
    email.isStar = 1;
    starAdd(email.emailId).then(() => {
      email.isStar = 1;
      emailStore.addStarEmailId = email.emailId
      setTimeout(() => emailStore.addStarEmailId = 0)
      emailStore.starScroll?.addItem(email)
    }).catch((e) => {
      console.error(e)
      email.isStar = 0;
    })
  }
}

const handleBack = () => {
  router.back()
}

const handleDelete = () => {
  ElMessageBox.confirm(t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    if (emailStore.contentData.delType === 'logic') {
      emailDelete(email.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.emailId]
      })
    } else  {

      allEmailDelete(email.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.emailId]
      })
    }

    router.back()
  })
}
</script>
<style scoped>
.message-page { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; background: var(--background); }
.message-toolbar { min-height: 56px; padding-inline: 12px; display: flex; align-items: center; gap: 2px; border-block-end: 1px solid var(--border); background: var(--surface); }
.toolbar-spacer { flex: 1; }
.message-scrollbar { min-height: 0; }
.message-card { width: min(920px, calc(100% - 32px)); min-height: calc(100% - 32px); margin: 16px auto; border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--surface); box-shadow: var(--shadow-card); overflow: hidden; }
.message-heading { padding: clamp(22px, 4vw, 38px); border-block-end: 1px solid var(--border); background: var(--surface-subtle); }
.message-heading__eyebrow { color: var(--primary); font-size: .6875rem; font-weight: 760; letter-spacing: .08em; text-transform: uppercase; }
.message-heading h2 { margin-block-start: 8px; color: var(--foreground); font-size: clamp(1.35rem, 3vw, 2rem); line-height: 1.22; letter-spacing: -.025em; overflow-wrap: anywhere; }
.message-meta { margin-block-start: 24px; display: grid; gap: 8px; }
.message-meta > div { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 12px; }
.message-meta dt { color: var(--muted-foreground); font-size: .75rem; font-weight: 650; }
.message-meta dd { min-width: 0; display: flex; flex-wrap: wrap; gap: 4px 8px; color: var(--foreground); font-size: .8125rem; overflow-wrap: anywhere; }
.message-meta dd span { color: var(--muted-foreground); }
.email-msg { width: fit-content; max-width: 100%; margin-block-start: 16px; }
.message-body { min-height: 220px; padding: clamp(20px, 4vw, 38px); overflow: auto; }
.email-text { margin: 0; color: var(--foreground); font: inherit; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
.attachments-panel { margin: 0 clamp(20px, 4vw, 38px) clamp(20px, 4vw, 38px); padding: 18px; border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--surface-subtle); }
.attachments-heading { margin-block-end: 12px; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.attachments-heading h3 { font-size: .875rem; }
.attachments-heading span { color: var(--muted-foreground); font-size: .75rem; }
.attachment-list { display: grid; gap: 8px; }
.attachment-row { min-width: 0; min-height: 58px; padding: 7px 8px 7px 12px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--surface); }
.attachment-type { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 9px; color: var(--primary); background: var(--primary-soft); }
.attachment-name { min-width: 0; display: grid; }
.attachment-name strong { overflow: hidden; font-size: .8125rem; text-overflow: ellipsis; white-space: nowrap; }
.attachment-name small { color: var(--muted-foreground); font-size: .6875rem; }
.attachment-download { width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--radius-control); color: var(--muted-foreground); }
.attachment-download:hover { color: var(--foreground); background: var(--surface-subtle); }
.attachment-download:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
@media (max-width: 600px) {
  .message-card { width: 100%; min-height: 100%; margin: 0; border: 0; border-radius: 0; }
  .message-heading, .message-body { padding: 20px 16px; }
  .message-meta > div { grid-template-columns: 64px minmax(0, 1fr); }
  .attachments-panel { margin: 0 16px 20px; padding: 12px; }
}
</style>
