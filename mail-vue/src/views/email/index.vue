<template>
  <emailScroll ref="scroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               :time-sort="params.timeSort"
               :email-read="emailRead"
               :show-unread="true"
               :show-account-icon="false"
               actionLeft="4px"
               @refresh-before="refreshMailboxOptions"
               @jump="jumpContent"
  >
    <template #first>
      <label class="mailbox-filter" for="inbox-mailbox-filter">
        <Mail :size="17" aria-hidden="true" />
        <span>{{ $t('filterByMailbox') }}</span>
        <select id="inbox-mailbox-filter" v-model.number="selectedAccountId" :disabled="mailboxLoading" @change="changeMailboxFilter">
          <option :value="ALL_MAILBOXES_ID">{{ $t('allMailboxes') }}</option>
          <option v-for="mailbox in mailboxes" :key="mailbox.accountId" :value="mailbox.accountId">{{ mailbox.email }}</option>
        </select>
        <ChevronDown :size="15" aria-hidden="true" />
      </label>
      <IconButton v-perm="'account:query'" :label="$t('manageMailboxes')" @click="uiStore.accountShow = true">
        <Settings2 :size="18" />
      </IconButton>
      <IconButton :label="params.timeSort === 0 ? $t('sortOldestFirst') : $t('sortNewestFirst')" @click="changeTimeSort">
        <ArrowDownNarrowWide v-if="params.timeSort === 0" :size="19" />
        <ArrowUpNarrowWide v-else :size="19" />
      </IconButton>
    </template>

  </emailScroll>
</template>

<script setup>
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete, emailLatest, emailRead} from "@/request/email.js";
import {accountList} from "@/request/account.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, onMounted, reactive, ref, watch} from "vue";
import {sleep} from "@/utils/time-utils.js";
import router from "@/router/index.js";
import { ArrowDownNarrowWide, ArrowUpNarrowWide, ChevronDown, Mail, Settings2 } from '@lucide/vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useRoute } from 'vue-router'
import { ALL_MAILBOXES_ID, resolveMailboxFilter } from '@/utils/mailbox-filter.js'

defineOptions({
  name: 'email'
})

const route = useRoute();
const emailStore = useEmailStore();
const settingStore = useSettingStore();
const uiStore = useUiStore();
const scroll = ref({})
const mailboxes = ref([])
const mailboxLoading = ref(false)
const selectedAccountId = ref(ALL_MAILBOXES_ID)
const params = reactive({
  timeSort: 0,
})

onMounted(() => {
  emailStore.emailScroll = scroll;
  loadMailboxOptions()
  latest()
})

watch(() => uiStore.accountShow, (open, previous) => {
  if (!open && previous) loadMailboxOptions()
})

async function loadMailboxOptions() {
  if (mailboxLoading.value) return
  mailboxLoading.value = true
  try {
    const nextMailboxes = []
    let lastAccountId = 0
    let lastSort = null
    while (true) {
      const page = await accountList(lastAccountId, 30, lastSort)
      nextMailboxes.push(...page)
      if (page.length < 30) break
      const last = page.at(-1)
      if (!last || (last.accountId === lastAccountId && last.sort === lastSort)) break
      lastAccountId = last.accountId
      lastSort = last.sort
    }
    mailboxes.value = nextMailboxes
    if (selectedAccountId.value !== ALL_MAILBOXES_ID && !nextMailboxes.some(item => item.accountId === selectedAccountId.value)) {
      selectedAccountId.value = ALL_MAILBOXES_ID
      changeMailboxFilter()
    }
  } finally {
    mailboxLoading.value = false
  }
}

function refreshMailboxOptions() {
  existIds.clear()
  loadMailboxOptions()
}

function changeMailboxFilter() {
  existIds.clear()
  scroll.value.refreshList?.()
}

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  scroll.value.refreshList();
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  router.push('/message')
}

const existIds = new Set();

async function latest() {
  while (true) {

    let autoRefresh = settingStore.settings.autoRefresh;
    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    if (route.name !== 'email') {
      continue;
    }

    const latestId = scroll.value.latestEmail?.emailId

    if (!scroll.value.firstLoad && autoRefresh > 1) {
      try {
        const accountId = resolveMailboxFilter(selectedAccountId.value)
        const curTimeSort = params.timeSort
        let list = []

        //确保发起请求时最后一个邮件是当前账号的,或者
        if (accountId === scroll.value.latestEmail?.reqAccountId) {
          list = await emailLatest(latestId, accountId);
        }

        //确保请求回来后，账号没有切换，时间排序没有改变，全部邮件类型没变
        const currentFilter = resolveMailboxFilter(selectedAccountId.value)
        if (accountId === currentFilter && params.timeSort === curTimeSort) {
          if (list.length > 0) {

            for (let email of list) {

              email.reqAccountId = accountId;

              if (!existIds.has(email.emailId)) {

                existIds.add(email.emailId)
                scroll.value.addItem(email)

                await sleep(50)
              }

            }

          }

        }
      } catch (e) {
        if (e.code === 401 || e.code === 403) {
          settingStore.settings.autoRefresh = 0;
        }
        console.error(e)
      }
    }
  }
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  const accountId = resolveMailboxFilter(selectedAccountId.value)
  return emailList(accountId, emailId, params.timeSort, size, 0).then(data => {
    if (data.latestEmail) {
      data.latestEmail.reqAccountId = accountId;
    }
    return data;
  })
}

</script>
<style scoped>
.mailbox-filter { min-width: 220px; height: 40px; padding-inline: 11px 8px; display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: var(--radius-control); color: var(--muted-foreground); background: var(--surface); cursor: pointer; }
.mailbox-filter:focus-within { border-color: var(--focus-ring); box-shadow: 0 0 0 3px color-mix(in oklch, var(--focus-ring) 18%, transparent); }
.mailbox-filter > span { font-size: .75rem; font-weight: 650; white-space: nowrap; }
.mailbox-filter select { min-width: 0; height: 38px; border: 0; outline: 0; color: var(--foreground); background: transparent; font-size: .8125rem; cursor: pointer; }
.mailbox-filter select:disabled { cursor: wait; opacity: .65; }
.mailbox-filter > svg:last-child { pointer-events: none; }

@media (max-width: 767px) {
  .mailbox-filter { min-width: 132px; width: auto; height: 44px; flex: 1 1 180px; grid-template-columns: auto minmax(0, 1fr) auto; }
  .mailbox-filter select { height: 42px; }
  .mailbox-filter > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
}
@media (max-width: 360px) {
  .mailbox-filter { min-width: 110px; }
}
</style>
