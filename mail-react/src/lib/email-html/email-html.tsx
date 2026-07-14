import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { sanitizeEmailHtml } from '../sanitize-email-html'

export interface EmailHtmlProps {
  html: string
  trustedImageOrigins?: string[]
  allowRemoteImages?: boolean
  className?: string
}

const SHADOW_BASE_STYLES = `
  :host { display: block; width: 100%; min-width: 0; color: #0f172a; }
  #email-content { min-width: 0; overflow-wrap: anywhere; }
  #email-content img { max-width: 100%; height: auto; }
  #email-content table { max-width: 100%; }
  #email-content pre { max-width: 100%; overflow: auto; white-space: pre-wrap; }
  #email-content .remote-image-blocked { display: none !important; }
`

export function EmailHtml({
  html,
  trustedImageOrigins = [],
  allowRemoteImages = true,
  className,
}: EmailHtmlProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const trustedOriginsKey = trustedImageOrigins.join('\n')

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = SHADOW_BASE_STYLES
    const content = document.createElement('div')
    content.id = 'email-content'
    content.innerHTML = sanitizeEmailHtml(html, {
      window,
      trustedImageOrigins,
      allowRemoteImages,
    })
    shadow.replaceChildren(style, content)

    let frame = 0
    const resize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = Math.ceil(content.getBoundingClientRect().height || content.scrollHeight)
        if (height > 0) host.style.height = `${height}px`
        else host.style.removeProperty('height')
      })
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(content)
    shadow.addEventListener('load', resize, true)
    resize()

    return () => {
      observer?.disconnect()
      shadow.removeEventListener('load', resize, true)
      cancelAnimationFrame(frame)
      shadow.replaceChildren()
      host.style.removeProperty('height')
    }
    // The key intentionally tracks array contents rather than its reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, allowRemoteImages, trustedOriginsKey])

  return <div ref={hostRef} className={cn('min-w-0 w-full', className)} data-email-html-host />
}
