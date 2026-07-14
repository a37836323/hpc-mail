<template>
  <div class="form-field" :class="{ 'form-field--error': error }">
    <div class="form-field__heading">
      <label class="form-field__label" :for="forId">{{ label }}</label>
      <slot name="action" />
    </div>
    <slot />
    <p v-if="error" :id="errorId" class="form-field__error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="form-field__hint">{{ hint }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  forId: { type: String, required: true },
  error: { type: String, default: '' },
  hint: { type: String, default: '' },
})
const errorId = computed(() => `${props.forId}-error`)
const hintId = computed(() => `${props.forId}-hint`)
</script>

<style scoped>
.form-field { display: grid; gap: 7px; min-width: 0; }
.form-field__heading { min-height: 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.form-field__label { color: var(--foreground); font-size: .875rem; line-height: 1.4; font-weight: 650; }
.form-field__error, .form-field__hint { margin: 0; font-size: .8125rem; line-height: 1.45; overflow-wrap: anywhere; }
.form-field__error { color: var(--destructive); }
.form-field__hint { color: var(--muted-foreground); }
</style>
