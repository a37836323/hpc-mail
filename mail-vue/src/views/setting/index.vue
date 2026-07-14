<template>
  <div class="box">
    <div class="container">
      <div class="title">{{$t('profile')}}</div>
      <div class="item">
        <div>{{$t('username')}}</div>
        <div>{{ userStore.user.username || '—' }}</div>
      </div>
      <div class="item">
        <div>{{$t('displayName')}}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="displayNameInput" :aria-label="$t('displayName')"></el-input>
            <button type="button" class="edit-name" :disabled="setNameLoading" @click="setName">
             {{$t('save')}}
            </button>
          </span>
          <span v-else class="user-name">
            <span >{{ userStore.user.displayName || '—' }}</span>
            <button type="button" class="edit-name" @click="showSetName">
             {{$t('change')}}
            </button>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{$t('password')}}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{$t('changePwdBtn')}}</el-button>
        </div>
      </div>
    </div>
    <div class="language">
      <div class="title">{{$t('language')}}</div>
      <el-select
          :model-value="langSelect"
          class="language-select"
          :aria-label="$t('language')"
          placeholder="Select"
          @change="changeLang"
      >
        <el-option label="中文" value="zh" @pointerdown.prevent.stop="changeLang('zh')"/>
        <el-option label="English" value="en" @pointerdown.prevent.stop="changeLang('en')"/>
      </el-select>
    </div>
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{$t('deleteUser')}}</div>
      <div style="color: var(--regular-text-color);">
        {{$t('delAccountMsg')}}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{$t('deleteUserBtn')}}</el-button>
      </div>
    </div>
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {reactive, ref, defineOptions} from 'vue'
import {resetPassword, setDisplayName, userDelete} from "@/request/my.js";
import {useUserStore} from "@/store/user.js";
import router from "@/router/index.js";
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";

const { t } = useI18n()
const settingStore = useSettingStore()
const userStore = useUserStore();
const setPwdLoading = ref(false)
const setNameLoading = ref(false)
const setNameShow = ref(false)
const displayNameInput = ref('')
const langSelect = ref(settingStore.lang)

defineOptions({
  name: 'setting'
})

function showSetName() {
  displayNameInput.value = userStore.user.displayName || ''
  setNameShow.value = true
}

function setName() {
  const name = displayNameInput.value.trim()

  if (!name) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  if (name === userStore.user.displayName) {
    setNameShow.value = false
    return
  }

  setNameLoading.value = true
  setDisplayName(name).then(() => {
    userStore.user.displayName = name
    setNameShow.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
  }).catch(() => {
    // Keep the editor open and preserve the entered name so it can be retried.
  }).finally(() => {
    setNameLoading.value = false
  })
}

function changeLang(lang) {
  let setting = {}
  try {
    setting = JSON.parse(localStorage.getItem('setting') || '{}')
  } catch (e) {
    setting = {}
  }
  localStorage.setItem('setting', JSON.stringify({...setting, lang}))
  window.location.reload()
}

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token');
      router.replace('/login');
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  })
}


function submitPwd() {

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    pwdShow.value = false
    setPwdLoading.value = false
    form.password = ''
    form.newPwd = ''
  }).catch(() => {
    setPwdLoading.value = false
  })

}

</script>
<style scoped lang="scss">
.box {
  width: min(880px, 100%);
  margin-inline: auto;
  padding: clamp(24px, 5vw, 56px);

  .update-pwd {
    display: grid;
    gap: 15px;
  }

  .title {
    font-size: 1rem;
    font-weight: 720;
  }

  .container {
    display: grid;
    margin-bottom: 32px;
    border-block: 1px solid var(--border);

    .item {
      min-height: 64px;
      padding-block: 12px;
      display: grid;
      grid-template-columns: minmax(110px, 160px) minmax(0, 1fr);
      gap: 24px;
      align-items: center;
      position: relative;
      border-block-end: 1px solid var(--border);

      &:last-child { border-block-end: 0; }

      .user-name {
        display: flex;
        align-items: center;
        gap: 8px;
        span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        display: flex;
        align-items: center;
        gap: 8px;
        .el-input {
          width: min(260px, 100%);
        }
      }

      .edit-name {
        min-height: 44px;
        padding-inline: 8px;
        display: inline-flex;
        align-items: center;
        color: var(--primary);
        font-weight: 650;
        cursor: pointer;

        &:disabled {
          opacity: .55;
          cursor: not-allowed;
        }
      }

      div:first-child {
        color: var(--muted-foreground);
        font-size: .8125rem;
        font-weight: 650;
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
  }

  .language {
    padding-block-end: 32px;
    display: grid;
    grid-template-columns: minmax(110px, 160px) minmax(0, 1fr);
    align-items: center;
    gap: 24px;
    border-block-end: 1px solid var(--border);

    .language-select {
      width: min(220px, 100%);
    }
  }

  .del-email {
    padding-block-start: 32px;
    display: grid;
    gap: 12px;

    .el-button { color: var(--destructive); border-color: color-mix(in oklch, var(--destructive) 35%, var(--border)); background: var(--destructive-soft); }
  }

  @media (max-width: 540px) {
    .container .item, .language { grid-template-columns: 1fr; gap: 7px; }
    .container .item { padding-block: 16px; }
    .edit-name-input, .user-name { flex-wrap: wrap; }
  }
}
</style>
