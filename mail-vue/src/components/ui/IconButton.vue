<template>
  <button class="icon-button" :class="[`icon-button--${variant}`]" type="button" :aria-label="label" :title="label">
    <slot />
  </button>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  variant: { type: String, default: 'ghost' },
})
</script>

<style scoped>
.icon-button {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  color: var(--muted-foreground);
  background: transparent;
  cursor: pointer;
  transition: color var(--motion-fast) var(--ease-out), background-color var(--motion-fast) var(--ease-out), transform var(--motion-fast) var(--ease-out);
}
.icon-button:hover { color: var(--foreground); background: var(--surface-subtle); }
.icon-button:active { transform: scale(.95); }
.icon-button--bordered { border-color: var(--border); background: var(--surface); }
.icon-button--danger { color: var(--destructive); }
</style>
