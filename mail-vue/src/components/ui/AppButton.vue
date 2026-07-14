<template>
  <button
    class="app-button"
    :class="[`app-button--${variant}`, `app-button--${size}`]"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <LoaderCircle v-if="loading" class="app-button__spinner" :size="18" aria-hidden="true" />
    <slot name="icon" />
    <span><slot /></span>
  </button>
</template>

<script setup>
import { LoaderCircle } from '@lucide/vue'

defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'default' },
  type: { type: String, default: 'button' },
  disabled: Boolean,
  loading: Boolean,
})
</script>

<style scoped>
.app-button {
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  padding-inline: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--primary-foreground);
  background: var(--primary);
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
  transition: transform var(--motion-fast) var(--ease-out), background-color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out);
}

.app-button:hover:not(:disabled) { background: var(--primary-hover); }
.app-button:active:not(:disabled) { transform: scale(.98); }
.app-button:disabled { cursor: not-allowed; opacity: .58; }
.app-button--secondary { color: var(--foreground); background: var(--surface); border-color: var(--border-strong); }
.app-button--secondary:hover:not(:disabled) { background: var(--surface-subtle); }
.app-button--ghost { color: var(--muted-foreground); background: transparent; }
.app-button--ghost:hover:not(:disabled) { color: var(--foreground); background: var(--surface-subtle); }
.app-button--danger { color: var(--destructive-foreground); background: var(--destructive); }
.app-button--sm { min-height: 40px; padding-inline: 14px; }
.app-button--block { width: 100%; }
.app-button__spinner { animation: app-spin .8s linear infinite; }
@keyframes app-spin { to { transform: rotate(360deg); } }
</style>
