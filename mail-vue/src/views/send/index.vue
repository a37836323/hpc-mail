<template>
  <emailScroll ref="sendScroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               show-status
               actionLeft="4px"
               :star-cancel="starCancel"
               @jump="jumpContent"
               :time-sort="params.timeSort"
               :type="'send'"
  >
    <template #first>
      <IconButton :label="params.timeSort === 0 ? $t('sortOldestFirst') : $t('sortNewestFirst')" @click="changeTimeSort">
        <ArrowDownNarrowWide v-if="params.timeSort === 0" :size="19" />
        <ArrowUpNarrowWide v-else :size="19" />
      </IconButton>
    </template>
  </emailScroll>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, onMounted, reactive, ref, watch} from "vue";
import router from "@/router/index.js";
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from '@lucide/vue'
import IconButton from '@/components/ui/IconButton.vue'

defineOptions({
  name: 'send'
})

const emailStore = useEmailStore();
const accountStore = useAccountStore();
const sendScroll = ref({})
const params = reactive({
  timeSort: 0,
})

onMounted(() => {
  emailStore.sendScroll = sendScroll;
})

watch(() => accountStore.currentAccountId, () => {
  sendScroll.value.refreshList();
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  sendScroll.value.refreshList();
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  router.push('/message')
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  // Sent mail is a user-level timeline. accountId=0 includes dynamic sender
  // identities that are intentionally not stored as mailbox accounts.
  const accountId = 0;
  const allReceive = 1;
  return emailList(accountId, allReceive, emailId, params.timeSort, size, 1).then(data => {
    if (data.latestEmail) {
      data.latestEmail.reqAccountId = accountId;
      data.latestEmail.allReceive = allReceive;
    }
    return data;
  })
}

</script>
