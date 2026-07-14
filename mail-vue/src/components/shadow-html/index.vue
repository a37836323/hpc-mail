<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSettingStore } from '@/store/setting.js'
import { sanitizeEmailHtml } from '@/utils/sanitize-email-html.js'
import { toOssDomain } from '@/utils/convert.js'

const props = defineProps({
  html: {
    type: String,
    required: true
  },
  allowRemoteImages: {
    type: Boolean,
    default: true,
  }
})

const container = ref(null)
const contentBox = ref(null)
const settingStore = useSettingStore()
let shadowRoot = null
let resizeObserver = null
let scaleFrame = 0

function updateContent() {
  if (!shadowRoot) return
  const trustedImageOrigin = toOssDomain(settingStore.settings.r2Domain)
  const cleanedHtml = sanitizeEmailHtml(props.html, {
    trustedImageOrigins: trustedImageOrigin ? [trustedImageOrigin] : [],
    allowRemoteImages: props.allowRemoteImages,
  })

  if (!shadowRoot.querySelector('.shadow-content')) {
    shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        display: block;
        width: 100%;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
                    'Noto Sans', Helvetica, sans-serif;
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
        transform-origin: top left;
      }

      img:not(table img) {
        max-width: 100%;
        height: auto !important;
      }

      img {
        vertical-align: middle;
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
  if (!shadowRoot || !contentBox.value || !container.value) return

  const parent = contentBox.value
  const shadowContent = shadowRoot.querySelector('.shadow-content')

  if (!shadowContent) return

  shadowContent.style.transform = 'none'
  const parentWidth = parent.clientWidth
  const childWidth = Math.max(shadowContent.scrollWidth, shadowContent.offsetWidth)

  if (parentWidth === 0 || childWidth === 0) return

  // Never enlarge authored mail. Scale down only when a legacy fixed-width
  // template would otherwise overflow the reading pane.
  const scale = Math.min(1, parentWidth / childWidth)
  const childHeight = shadowContent.scrollHeight
  const scaledHeight = Math.ceil(childHeight * scale)

  shadowContent.style.transform = scale < 1 ? `scale(${scale})` : 'none'
  const nextHeight = `${scaledHeight}px`
  if (container.value.style.height !== nextHeight) container.value.style.height = nextHeight
}

function scheduleScale() {
  if (scaleFrame) cancelAnimationFrame(scaleFrame)
  scaleFrame = requestAnimationFrame(() => {
    scaleFrame = 0
    autoScale()
  })
}

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
  shadowRoot.addEventListener('load', scheduleScale, true)
  shadowRoot.addEventListener('error', scheduleScale, true)

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleScale)
    resizeObserver.observe(contentBox.value)
    const shadowContent = shadowRoot.querySelector('.shadow-content')
    if (shadowContent) resizeObserver.observe(shadowContent)
  }

  scheduleScale()
  document.fonts?.ready?.then(scheduleScale).catch(() => {})
})

watch(() => [props.html, props.allowRemoteImages], async () => {
  updateContent()
  await nextTick()
  scheduleScale()
})

onBeforeUnmount(() => {
  if (scaleFrame) cancelAnimationFrame(scaleFrame)
  resizeObserver?.disconnect()
  shadowRoot?.removeEventListener('load', scheduleScale, true)
  shadowRoot?.removeEventListener('error', scheduleScale, true)
})
</script>

<style scoped>
.content-box {
  width: 100%;
  overflow: hidden;
  font-family: -apple-system, Inter, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
}

.content-html {
  width: 100%;
  min-height: 1px;
}
</style>
