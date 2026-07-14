<template>
  <main class="auth-page">
    <div class="auth-utilities">
      <IconButton :label="settingStore.lang === 'zh' ? 'Switch to English' : '切换到中文'" @click="toggleLanguage"><Languages :size="19" /></IconButton>
      <IconButton :label="uiStore.dark ? $t('useLightTheme') : $t('useDarkTheme')" @click="toggleTheme">
        <Sun v-if="uiStore.dark" :size="19" />
        <Moon v-else :size="19" />
      </IconButton>
    </div>

    <section class="auth-shell" :aria-labelledby="show === 'login' ? 'login-title' : 'register-title'">
      <header class="auth-brandline">
        <span class="brand-mark"><Mail :size="22" aria-hidden="true" /></span>
        <div>
          <p>{{ settingStore.settings.title }}</p>
          <span>{{ $t('authPrivateWorkspace') }}</span>
        </div>
      </header>
      <div class="auth-card">
        <form v-if="show === 'login'" class="auth-form" novalidate @submit.prevent="submitLogin">
          <header class="auth-form__header">
            <p class="auth-form__kicker">{{ $t('welcomeBack') }}</p>
            <h2 id="login-title">{{ $t('loginTitleModern') }}</h2>
            <p>{{ $t('loginDescriptionModern') }}</p>
          </header>

          <div v-if="loginErrors.service" class="auth-alert" role="alert"><CircleAlert :size="18" /><span>{{ loginErrors.service }}</span></div>

          <FormField :label="$t('username')" for-id="login-username" :error="loginErrors.username">
            <div class="input-wrap"><UserRound :size="18" aria-hidden="true" /><input id="login-username" ref="loginUsernameRef" v-model.trim="loginForm.username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" :placeholder="$t('usernamePlaceholder')" :aria-invalid="Boolean(loginErrors.username)" :aria-describedby="loginErrors.username ? 'login-username-error' : undefined" @blur="validateLoginUsername" /></div>
          </FormField>

          <FormField :label="$t('password')" for-id="login-password" :error="loginErrors.password">
            <template #action><button type="button" class="field-action" :aria-label="showLoginPassword ? $t('hidePassword') : $t('showPassword')" @click="showLoginPassword = !showLoginPassword">{{ showLoginPassword ? $t('hide') : $t('show') }}</button></template>
            <div class="input-wrap"><LockKeyhole :size="18" aria-hidden="true" /><input id="login-password" v-model="loginForm.password" :type="showLoginPassword ? 'text' : 'password'" autocomplete="current-password" :placeholder="$t('passwordPlaceholder')" :aria-invalid="Boolean(loginErrors.password)" @blur="validateLoginPassword" /></div>
          </FormField>

          <AppButton class="auth-submit" type="submit" :loading="loginLoading">{{ $t('loginBtn') }}</AppButton>
          <button v-if="registrationEnabled" type="button" class="auth-switch" @click="switchMode('register')">{{ $t('noAccount') }} <strong>{{ $t('regSwitch') }}</strong></button>
        </form>

        <form v-else class="auth-form" novalidate @submit.prevent="submitRegister">
          <header class="auth-form__header">
            <p class="auth-form__kicker">{{ $t('createIdentity') }}</p>
            <h2 id="register-title">{{ $t('registerTitleModern') }}</h2>
            <p>{{ $t('registerDescriptionModern') }}</p>
          </header>

          <div v-if="registerErrors.service" class="auth-alert" role="alert"><CircleAlert :size="18" /><span>{{ registerErrors.service }}</span></div>

          <FormField :label="$t('username')" for-id="register-username" :error="registerErrors.username" :hint="$t('usernameRules')">
            <div class="input-wrap"><UserRound :size="18" /><input id="register-username" ref="registerUsernameRef" v-model.trim="registerForm.username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" :placeholder="$t('usernameExample')" :aria-invalid="Boolean(registerErrors.username)" @blur="validateRegisterUsername" /></div>
          </FormField>
          <FormField :label="$t('password')" for-id="register-password" :error="registerErrors.password" :hint="$t('passwordRules')">
            <template #action><button type="button" class="field-action" @click="showRegisterPassword = !showRegisterPassword">{{ showRegisterPassword ? $t('hide') : $t('show') }}</button></template>
            <div class="input-wrap"><LockKeyhole :size="18" /><input id="register-password" v-model="registerForm.password" :type="showRegisterPassword ? 'text' : 'password'" autocomplete="new-password" :placeholder="$t('passwordPlaceholder')" :aria-invalid="Boolean(registerErrors.password)" @blur="validateRegisterPassword" /></div>
          </FormField>
          <FormField :label="$t('confirmPwd')" for-id="register-confirm" :error="registerErrors.confirmPassword">
            <div class="input-wrap"><LockKeyhole :size="18" /><input id="register-confirm" v-model="registerForm.confirmPassword" :type="showRegisterPassword ? 'text' : 'password'" autocomplete="new-password" :placeholder="$t('confirmPasswordPlaceholder')" :aria-invalid="Boolean(registerErrors.confirmPassword)" @blur="validateConfirmPassword" /></div>
          </FormField>
          <FormField v-if="settingStore.settings.regKey === 0 || settingStore.settings.regKey === 2" :label="settingStore.settings.regKey === 0 ? $t('regKey') : $t('regKeyOptional')" for-id="register-code" :error="registerErrors.code">
            <div class="input-wrap"><TicketCheck :size="18" /><input id="register-code" v-model.trim="registerForm.code" type="text" autocomplete="one-time-code" :placeholder="$t('inviteCodePlaceholder')" @blur="validateRegisterCode" /></div>
          </FormField>
          <div v-show="verifyShow" class="register-turnstile" :data-sitekey="settingStore.settings.siteKey" data-callback="onTurnstileSuccess" data-error-callback="onTurnstileError">
            <p v-if="botJsError" class="field-error" role="alert">{{ $t('verifyModuleFailed') }}</p>
          </div>
          <AppButton class="auth-submit" type="submit" :loading="registerLoading">{{ $t('createAccount') }}</AppButton>
          <button type="button" class="auth-switch" @click="switchMode('login')">{{ $t('hasAccount') }} <strong>{{ $t('loginSwitch') }}</strong></button>
        </form>
      </div>
    </section>
    <a v-if="settingStore.settings.projectLink" class="project-link" href="https://github.com/maillab/cloud-mail" target="_blank" rel="noreferrer"><Code2 :size="19" /><span class="sr-only">GitHub</span></a>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { CircleAlert, Code2, Languages, LockKeyhole, Mail, Moon, Sun, TicketCheck, UserRound } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import IconButton from '@/components/ui/IconButton.vue'
import router from '@/router'
import { login, register } from '@/request/login.js'
import { loginUserInfo } from '@/request/my.js'
import { websiteConfig } from '@/request/setting.js'
import { permsToRouter } from '@/perm/perm.js'
import { useAccountStore } from '@/store/account.js'
import { useSettingStore } from '@/store/setting.js'
import { useUiStore } from '@/store/ui.js'
import { useUserStore } from '@/store/user.js'
import { setExtend } from '@/utils/day.js'
import { isValidUsername } from '@/utils/username.js'

const { t, locale } = useI18n()
const accountStore = useAccountStore()
const userStore = useUserStore()
const uiStore = useUiStore()
const settingStore = useSettingStore()
const show = ref('login')
const loginLoading = ref(false)
const registerLoading = ref(false)
const showLoginPassword = ref(false)
const showRegisterPassword = ref(false)
const verifyShow = ref(false)
const botJsError = ref(false)
const loginUsernameRef = ref(null)
const registerUsernameRef = ref(null)
let verifyToken = ''
let turnstileId = null
let verifyErrorCount = 0

const loginForm = reactive({ username: '', password: '' })
const registerForm = reactive({ username: '', password: '', confirmPassword: '', code: '' })
const loginErrors = reactive({ username: '', password: '', service: '' })
const registerErrors = reactive({ username: '', password: '', confirmPassword: '', code: '', service: '' })
const registrationEnabled = computed(() => settingStore.settings.register === 0)

window.onTurnstileSuccess = token => { verifyToken = token }
window.onTurnstileError = () => {
  if (verifyErrorCount++ >= 4) return
  window.setTimeout(() => nextTick(() => {
    try {
      if (!turnstileId) turnstileId = window.turnstile?.render('.register-turnstile')
      else window.turnstile?.reset(turnstileId)
    } catch { botJsError.value = true }
  }), 1500)
}

function validateUsername(value) {
  if (!value) return t('usernameRequired')
  if (!isValidUsername(value)) return t('usernameInvalid')
  return ''
}
function validateLoginUsername() { loginErrors.username = validateUsername(loginForm.username); return !loginErrors.username }
function validateLoginPassword() { loginErrors.password = loginForm.password ? '' : t('passwordRequired'); return !loginErrors.password }
function validateRegisterUsername() { registerErrors.username = validateUsername(registerForm.username); return !registerErrors.username }
function validateRegisterPassword() { registerErrors.password = registerForm.password.length >= 6 ? '' : t('passwordInvalid'); return !registerErrors.password }
function validateConfirmPassword() { registerErrors.confirmPassword = registerForm.password === registerForm.confirmPassword && registerForm.confirmPassword ? '' : t('confirmPwdFailMsg'); return !registerErrors.confirmPassword }
function validateRegisterCode() { registerErrors.code = settingStore.settings.regKey === 0 && !registerForm.code ? t('emptyRegKeyMsg') : ''; return !registerErrors.code }
function errorMessage(error, fallback) { return error?.message || error?.response?.data?.message || fallback }

async function submitLogin() {
  loginErrors.service = ''
  if (![validateLoginUsername(), validateLoginPassword()].every(Boolean)) return
  loginLoading.value = true
  try {
    const data = await login(loginForm.username, loginForm.password)
    await saveToken(data.token)
  } catch (error) {
    loginErrors.service = errorMessage(error, t('invalidCredentials'))
  } finally { loginLoading.value = false }
}

async function submitRegister() {
  registerErrors.service = ''
  if (![validateRegisterUsername(), validateRegisterPassword(), validateConfirmPassword(), validateRegisterCode()].every(Boolean)) return
  if (!verifyToken && needsTurnstile()) { revealTurnstile(); return }
  registerLoading.value = true
  let registrationCompleted = false
  try {
    const data = await register({ username: registerForm.username, password: registerForm.password, token: verifyToken, code: registerForm.code || null })
    registrationCompleted = true
    settingStore.settings.regVerifyOpen = data?.regVerifyOpen ?? settingStore.settings.regVerifyOpen
    const authData = data?.token ? data : await login(registerForm.username, registerForm.password)
    await saveToken(authData.token)
  } catch (error) {
    if (registrationCompleted) {
      loginForm.username = registerForm.username
      switchMode('login')
      loginErrors.service = t('registeredSignInAgain')
    } else {
      registerErrors.service = errorMessage(error, t('registrationFailed'))
      if (error?.code === 400) { verifyToken = ''; settingStore.settings.regVerifyOpen = true; revealTurnstile() }
    }
  } finally {
    if (registrationCompleted) {
      registerForm.password = ''
      registerForm.confirmPassword = ''
    }
    registerLoading.value = false
  }
}

function needsTurnstile() { return settingStore.settings.registerVerify === 0 || (settingStore.settings.registerVerify === 2 && settingStore.settings.regVerifyOpen) }
function revealTurnstile() {
  verifyShow.value = true
  nextTick(() => {
    try {
      if (!turnstileId) turnstileId = window.turnstile?.render('.register-turnstile')
      else window.turnstile?.reset(turnstileId)
    } catch { botJsError.value = true }
  })
}
function switchMode(mode) {
  show.value = mode
  loginErrors.service = registerErrors.service = ''
  nextTick(() => (mode === 'login' ? loginUsernameRef.value : registerUsernameRef.value)?.focus())
}
async function saveToken(token) {
  localStorage.setItem('token', token)
  const [setting, user] = await Promise.all([websiteConfig(), loginUserInfo()])
  settingStore.settings = setting
  settingStore.domainList = setting.domainList || []
  userStore.user = user
  accountStore.currentAccountId = 0
  accountStore.currentAccount = {}
  accountStore.hasAccounts = false
  permsToRouter(user.permKeys || []).forEach(routeData => { if (!router.hasRoute(routeData.name)) router.addRoute('layout', routeData) })
  document.title = setting.title
  await router.replace({ name: 'layout' })
  uiStore.showNotice()
}
function toggleTheme() {
  uiStore.dark = !uiStore.dark
  document.documentElement.classList.toggle('dark', uiStore.dark)
  document.getElementById('theme-color-meta')?.setAttribute('content', uiStore.dark ? '#121826' : '#F7F9FC')
}
function toggleLanguage() {
  const lang = settingStore.lang === 'zh' ? 'en' : 'zh'
  settingStore.lang = lang; locale.value = lang; setExtend(lang === 'en' ? 'en' : 'zh-cn')
}

onMounted(() => {
  if (window.innerWidth >= 768 && window.matchMedia('(pointer: fine)').matches) {
    loginUsernameRef.value?.focus()
  }
})
</script>

<style scoped>
.auth-page { min-height: 100dvh; padding: max(76px, calc(env(safe-area-inset-top) + 56px)) 20px max(40px, env(safe-area-inset-bottom)); display: flex; align-items: center; justify-content: center; overflow-y: auto; color: var(--foreground); background: var(--background); }
.auth-utilities { position: fixed; inset-block-start: max(12px, env(safe-area-inset-top)); inset-inline-end: max(14px, env(safe-area-inset-right)); z-index: 5; display: flex; gap: 2px; }
.auth-shell { width: min(100%, 400px); display: grid; gap: 18px; }
.auth-brandline { display: flex; align-items: center; justify-content: center; gap: 11px; }
.brand-mark { width: 40px; height: 40px; flex: 0 0 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 12px; color: var(--primary-foreground); background: var(--primary); }
.auth-brandline div { min-width: 0; display: grid; gap: 1px; }
.auth-brandline p { overflow: hidden; font-size: .9375rem; font-weight: 760; letter-spacing: -.015em; text-overflow: ellipsis; white-space: nowrap; }
.auth-brandline span:not(.brand-mark) { color: var(--subtle-foreground); font-size: .6875rem; }
.auth-card { width: 100%; padding: 30px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); box-shadow: 0 16px 50px color-mix(in oklch, var(--foreground) 7%, transparent); }
.auth-form { display: grid; gap: 16px; }
.auth-form__header { margin-block-end: 6px; }
.auth-form__kicker { color: var(--primary) !important; font-size: .75rem !important; font-weight: 760; letter-spacing: .06em; text-transform: uppercase; }
.auth-form__header h2 { margin-block-start: 6px; font-size: 1.5rem; line-height: 1.2; letter-spacing: -.03em; }
.auth-form__header p:last-child { margin-block-start: 8px; color: var(--muted-foreground); font-size: .875rem; line-height: 1.5; }
.auth-alert { padding: 12px 14px; display: flex; align-items: flex-start; gap: 10px; border: 1px solid color-mix(in oklch, var(--destructive) 35%, var(--border)); border-radius: var(--radius-control); color: var(--destructive); background: var(--destructive-soft); font-size: .875rem; }
.auth-alert svg { flex: 0 0 auto; margin-block-start: 1px; }
.input-wrap { min-height: 46px; padding-inline: 13px; display: flex; align-items: center; gap: 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-control); background: var(--surface); transition: border-color var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out); }
.input-wrap:focus-within { border-color: var(--focus-ring); box-shadow: 0 0 0 3px color-mix(in oklch, var(--focus-ring) 18%, transparent); }
.input-wrap svg { flex: 0 0 auto; color: var(--subtle-foreground); }
.input-wrap input { width: 100%; min-width: 0; height: 44px; border: 0; outline: 0; color: var(--foreground); background: transparent; }
.input-wrap input::placeholder { color: var(--subtle-foreground); }
.field-action { min-height: 44px; margin-block: -12px; padding-inline: 6px; color: var(--primary); background: transparent; font-size: .8125rem; font-weight: 650; cursor: pointer; }
.auth-submit { width: 100%; margin-block-start: 4px; }
.auth-switch { min-height: 44px; padding: 8px; border: 0; color: var(--muted-foreground); background: transparent; cursor: pointer; }
.auth-switch strong { color: var(--primary); }
.register-turnstile { min-height: 65px; }
.field-error { color: var(--destructive); font-size: .8125rem; }
.project-link { position: fixed; inset-inline-end: 16px; inset-block-end: 16px; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border); border-radius: var(--radius-control); color: var(--muted-foreground); background: var(--surface); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

@media (max-width: 480px) {
  .auth-page { padding: max(68px, calc(env(safe-area-inset-top) + 56px)) 20px max(24px, env(safe-area-inset-bottom)); align-items: flex-start; }
  .auth-shell { width: min(100%, 352px); gap: 0; }
  .auth-brandline { display: none; }
  .auth-card { padding: 22px 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .auth-form { gap: 14px; }
  .auth-form__header { margin-block-end: 2px; }
  .auth-form__header h2 { font-size: 1.375rem; }
}

</style>
