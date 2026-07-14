<template>
  <section class="reg-key" aria-labelledby="reg-key-title">
    <header class="admin-toolbar">
      <div class="admin-toolbar__heading"><h2 id="reg-key-title">{{ $t('inviteCode') }}</h2><p>{{ $t('inviteCodeWorkspaceDescription') }}</p></div>
      <form class="admin-search" role="search" @submit.prevent="search">
        <el-input
            v-model="params.code"
            class="search-input"
            :placeholder="$t('searchRegKeyDesc')"
        >
        </el-input>
        <IconButton :label="$t('search')" variant="bordered" @click="search"><Search :size="18" /></IconButton>
        <IconButton :label="$t('refresh')" variant="bordered" @click="refresh"><RefreshCw :size="18" /></IconButton>
        <IconButton :label="$t('clearRegKey')" variant="danger" @click="clearNotUse"><Trash2 :size="18" /></IconButton>
        <AppButton @click="openAdd"><template #icon><Plus :size="18" /></template>{{ $t('addRegKey') }}</AppButton>
      </form>
    </header>

    <el-scrollbar class="scrollbar">
      <div  class="loading" :class="regKeyLoading ? 'loading-show' : 'loading-hide'" :style="regKeyFirst ? 'background: transparent' : ''">
        <loading/>
      </div>
      <div class="code-box">
        <div class="code-item" v-for="item in regKeyData">
          <div class="code-info">
            <div class="info-left">
              <div class="info-left-item">
                <button type="button" class="code" :aria-label="$t('copyInviteCode', { code: item.code })" @click="copyCode(item.code)">{{ item.code }}<Copy :size="15" aria-hidden="true" /></button>
              </div>
              <div class="info-left-item">
                <div>{{ $t('remainingUses') }}：</div>
                <div v-if="item.count">{{ item.count }}</div>
                <el-tag v-else type="danger">{{ $t('exhausted') }}</el-tag>
              </div>
              <div class="info-left-item">
                <div>{{ $t('roleDesc') }}：</div>
                <el-tag>{{ item.roleName }}</el-tag>
              </div>
              <div class="info-left-item">
                <div>{{ $t('validUntil') }}：</div>
                <div v-if="item.expireTime">{{ formatExpireTime(item.expireTime) }}</div>
                <el-tag v-else type="danger">{{ $t('expired') }}</el-tag>
              </div>
            </div>
            <div class="info-right">
              <el-dropdown class="setting">
                <IconButton :label="$t('action')"><MoreHorizontal :size="20" /></IconButton>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="copyCode(item.code)">{{ $t('copy') }}</el-dropdown-item>
                    <el-dropdown-item @click="openHistory(item)">{{ $t('history') }}</el-dropdown-item>
                    <el-dropdown-item @click="deleteRegKey(item)">{{ $t('delete') }}</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
      </div>
      <div class="empty" v-if="regKeyData.length === 0">
        <el-empty v-if="!regKeyFirst" :image-size="isMobile ? 120 : null" :description="$t('noCodeFound')"/>
      </div>
    </el-scrollbar>
    <el-dialog v-model="showAdd" :title="$t('addRegKey')">
      <div class="container">
        <el-input v-model="addForm.code" :placeholder="$t('regKey')">
          <template #suffix>
            <IconButton :label="$t('generateInviteCode')" class="gen-code" @click.stop="genCode"><RefreshCw :size="18" /></IconButton>
          </template>
        </el-input>
        <el-select v-model="addForm.roleId" :placeholder="$t('roleDesc')">
          <el-option v-for="item in roleList" :label="item.name" :value="item.roleId" :key="item.roleId"/>
        </el-select>
        <el-date-picker
            v-model="addForm.expireTime"
            type="date"
            :placeholder="$t('validUntil')"
        />
        <el-input-number v-model="addForm.count" :min="1" :max="99999"/>
        <el-button class="btn" type="primary" @click="submit" :loading="addLoading"
        >{{ $t('add') }}
        </el-button>
      </div>
    </el-dialog>
    <el-dialog class="history-list" v-model="showRegKeyHistory" :title="$t('useHistory')">
      <div class="loading" :class="historyLoading ? 'loading-show' : 'loading-hide'">
        <loading/>
      </div>
      <el-table v-if="!historyLoading" :data="historyList" :fit="true" style="height: 100%">
        <el-table-column :min-width="usernameColumnWidth" property="username" :label="$t('username')"
                         :show-overflow-tooltip="true"/>
        <el-table-column :width="createTimeColumnWidth" :formatter="formatUserCreateTime" property="createTime"
                         :label="$t('date')" fixed="right" :show-overflow-tooltip="true"/>
      </el-table>
    </el-dialog>
  </section>
</template>

<script setup>
import {defineOptions, nextTick, reactive, ref, watch} from "vue"
import { Copy, MoreHorizontal, Plus, RefreshCw, Search, Trash2 } from '@lucide/vue'
import AppButton from '@/components/ui/AppButton.vue'
import IconButton from '@/components/ui/IconButton.vue'
import loading from "@/components/loading/index.vue";
import {useSettingStore} from "@/store/setting.js";
import {roleSelectUse} from "@/request/role.js";
import {useRoleStore} from "@/store/role.js";
import {regKeyAdd, regKeyList, regKeyClearNotUse, regKeyDelete, regKeyHistory} from "@/request/reg-key.js";
import {getTextWidth, selectLongestDisplayText} from "@/utils/text.js";
import dayjs from "dayjs";
import {tzDayjs} from "@/utils/day.js";
import {useI18n} from "vue-i18n";

defineOptions({
  name: 'reg-key'
})

const roleStore = useRoleStore();
const settingStore = useSettingStore();
const params = reactive({
  code: '',
})

const {t} = useI18n()
const roleList = reactive([])
const addLoading = ref(false)
const showAdd = ref(false)
const regKeyLoading = ref(true)
const regKeyFirst = ref(true)
const showRegKeyHistory = ref(false)
const historyList = reactive([])
const usernameColumnWidth = ref(0)
const createTimeColumnWidth = ref(0)
const historyLoading = ref(false)
const isMobile = window.innerWidth < 1025

const addForm = reactive({
  code: '',
  count: 1,
  roleId: null,
  expireTime: null
})

const regKeyData = reactive([])

getList(true)

roleSelectUse().then(list => {
  roleList.length = 0
  roleList.push(...list)
})

watch(() => roleStore.refresh, () => {
  roleSelectUse().then(list => {
    roleList.length = 0
    roleList.push(...list)
  })
})

function openHistory(regKey) {

  historyList.length = 0
  historyLoading.value = true
  regKeyHistory(regKey.regKeyId).then(list => {

    historyList.push(...list)
    if (list.length > 0) {

      const username = selectLongestDisplayText(list, 'username')
      usernameColumnWidth.value = Math.min(getTextWidth(username) + 30, 300)
      const createTime = selectLongestDisplayText(list, 'createTime')
      createTimeColumnWidth.value = getTextWidth(createTime)
    }

  }).finally(() => {
    historyLoading.value = false
  })

  showRegKeyHistory.value = true
}

function formatUserCreateTime(regKey) {
  const createTime = tzDayjs(regKey.createTime);
  const currentYear = dayjs().year();
  const expireYear = createTime.year();

  if (settingStore.lang === 'en') {

    if (expireYear === currentYear) {
      return createTime.format('MMM D, HH:mm');
    } else {
      return createTime.format('MMM D, YYYY HH:mm');
    }

  } else {

    if (expireYear === currentYear) {
      return createTime.format('M月D日 HH:mm');
    } else {
      return createTime.format('YYYY年M月D日 HH:mm');
    }

  }

}

function formatExpireTime(expireTime) {
  const expireDate = tzDayjs(expireTime);
  const currentYear = dayjs().year();
  const expireYear = expireDate.year();

  if (settingStore.lang === 'en') {

    return expireYear === currentYear
        ? expireDate.format('MMM D')
        : expireDate.format('MMM D, YYYY');

  } else {

    return expireYear === currentYear
        ? expireDate.format('M月D日')
        : expireDate.format('YYYY年M月D日');

  }
}

function refresh() {
  params.code = null
  getList(true)
}

function search() {
  getList(true)
}

function getList(showLoading = false) {
  if (showLoading) {
    regKeyLoading.value = true
  }
  regKeyList(params).then(list => {
    regKeyData.length = 0
    regKeyData.push(...list)
    regKeyLoading.value = false
    setTimeout(() => {
      regKeyFirst.value = false
    },200)
  })
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error('复制失败:', err);
    ElMessage({
      message: '复制失败',
      type: 'error',
      plain: true,
    })
  }
}

function genCode() {
  addForm.code = generateRandomCode()
}

function generateRandomCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const random = new Uint8Array(length)
  crypto.getRandomValues(random)
  return Array.from(random, value => chars[value % chars.length]).join('')
}

function clearNotUse() {
  ElMessageBox.confirm(t('clearRegKey'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    regKeyClearNotUse().then(() => {
      ElMessage({
        message: t('clearSuccess'),
        type: 'success',
        plain: true,
      })
      getList()
    })
  });
}

function submit() {

  if (!addForm.code) {
    ElMessage({
      message: t('emptyRegKeyMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.roleId) {
    ElMessage({
      message: t('emptyRole'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.expireTime) {
    ElMessage({
      message: t('emptyTimeMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.count) {
    ElMessage({
      message: t('emptyCountMsg'),
      type: "error",
      plain: true
    })
    return
  }

  addLoading.value = true
  regKeyAdd(addForm).then(() => {
    showAdd.value = false
    resetForm()
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    })
    getList()
  }).finally(() => {
    addLoading.value = false
  })
}

function deleteRegKey(regKey) {
  ElMessageBox.confirm(t('delConfirm', {msg: regKey.code}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    regKeyDelete([regKey.regKeyId]).then(() => {
      getList()
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
    })
  });
}

function resetForm() {
  addForm.code = ''
}

function openAdd() {
  genCode()
  showAdd.value = true
}

</script>

<style scoped lang="scss">
.reg-key {
  height: 100%;
  padding: clamp(14px, 2.5vw, 24px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  overflow: hidden;
  background: var(--background);
}

.admin-toolbar { min-width: 0; display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
.admin-toolbar__heading { min-width: 180px; }
.admin-toolbar h2 { color: var(--foreground); font-size: 1.25rem; letter-spacing: -.02em; }
.admin-toolbar p { margin-block-start: 4px; color: var(--muted-foreground); font-size: .8125rem; }
.admin-search { min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.search-input { width: min(240px, 28vw); }

.scrollbar {
  height: 100%;
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface-subtle);
  box-shadow: var(--shadow-card);

  .code-box {
    padding: 15px 15px 25px 15px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 15px;

    .code-item {
      background: var(--surface);
      border-radius: var(--radius-card);
      border: 1px solid var(--border);
      transition: all 200ms;
      padding: 18px;

      .code-info {
        display: flex;

        .info-left {
          flex: 1;
          min-width: 0;

          .info-left-item {
            display: flex;
            padding-top: 5px;

            .code {
              min-height: 34px;
              padding: 4px 7px;
              display: inline-flex;
              align-items: center;
              gap: 7px;
              border-radius: var(--radius-sm);
              color: var(--primary);
              background: var(--primary-soft);
              font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
              font-weight: 720;
              font-size: .875rem;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              cursor: pointer;
            }
          }

          .info-left-item:first-child {
            padding-top: 0;
          }
        }

        .info-right {
          display: flex;
          flex-direction: column;
          padding-top: 2px;
          gap: 5px;
        }
      }
    }
  }
}

.empty {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

:deep(.history-list.el-dialog) {
  min-height: 300px;
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.history-list .loading {
  position: absolute;
  top: 10px;
  z-index: 0;
  background: rgba(255, 255, 255, 0);
}

:deep(.history-list .el-dialog__header) {
  padding-bottom: 5px;
}

:deep(.el-scrollbar__view) {
  height: calc(100% - 80px);
}

.loading {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--loadding-background);
  z-index: 2;
}

.loading-show {
  transition: all 200ms ease 200ms;
  opacity: 1;
}

.loading-hide {
  pointer-events: none;
  transition: var(--loading-hide-transition);
  opacity: 0;
}

.container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.gen-code { width: 36px; height: 36px; flex-basis: 36px; }

:deep(.el-table__inner-wrapper:before) {
  background: var(--el-bg-color);
}

@media (max-width: 840px) {
  .admin-toolbar { align-items: flex-start; }
  .admin-toolbar__heading p { display: none; }
  .admin-search { flex-wrap: wrap; }
  .search-input { width: min(240px, calc(100vw - 170px)); }
  .admin-search :deep(.app-button span) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .admin-search :deep(.app-button) { width: 44px; padding: 0; }
}
@media (max-width: 560px) {
  .reg-key { padding: 12px; }
  .admin-toolbar { display: grid; }
  .admin-search { justify-content: flex-start; }
  .search-input { flex: 1; width: auto; min-width: 150px; }
  .scrollbar .code-box { grid-template-columns: minmax(0, 1fr); padding: 10px; }
}

</style>
