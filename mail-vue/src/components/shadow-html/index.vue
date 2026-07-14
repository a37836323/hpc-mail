<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useSettingStore } from '@/store/setting.js'
import { sanitizeEmailHtml } from '@/utils/sanitize-email-html.js'
import { toOssDomain } from '@/utils/convert.js'

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const container = ref(null)
const contentBox = ref(null)
const settingStore = useSettingStore()
let shadowRoot = null

function updateContent() {
  if (!shadowRoot) return
  const trustedImageOrigin = toOssDomain(settingStore.settings.r2Domain)
  const cleanedHtml = sanitizeEmailHtml(props.html, {
    trustedImageOrigins: trustedImageOrigin ? [trustedImageOrigin] : [],
  })

  if (!shadowRoot.querySelector('.shadow-content')) {
    shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        width: 100%;
        height: 100%;
        font-family: -apple-system, Inter, BlinkMacSystemFont,
                    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #13181D;
        word-break: break-word;
      }

      h1, h2, h3, h4 {
          font-size: 18px;
          font-weight: 700;
      }

      p {
        margin: 0;
      }

      a {
        text-decoration: none;
        color: #0E70DF;
      }

      .shadow-content {
        background: #FFFFFF;
        width: fit-content;
        height: fit-content;
        min-width: 100%;
      }

      img:not(table img) {
        max-width: 100%;
        height: auto !important;
      }

      img.remote-image-blocked {
        display: none !important;
      }

    </style>
    <div class="shadow-content"></div>
  `
  }
  shadowRoot.querySelector('.shadow-content').innerHTML = cleanedHtml
}

function autoScale() {
  if (!shadowRoot || !contentBox.value) return

  const parent = contentBox.value
  const shadowContent = shadowRoot.querySelector('.shadow-content')

  if (!shadowContent) return

  const parentWidth = parent.offsetWidth
  const childWidth = shadowContent.scrollWidth

  if (childWidth === 0) return

  const scale = parentWidth / childWidth

  const hostElement = shadowRoot.host
  hostElement.style.zoom = scale
}

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
  autoScale()
})

watch(() => props.html, () => {
  updateContent()
  autoScale()
})
</script>

<style scoped>
.content-box {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, Inter, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
}

.content-html {
  width: 100%;
  height: 100%;
}
</style>
