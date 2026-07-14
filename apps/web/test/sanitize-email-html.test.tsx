import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EmailHtml, sanitizeEmailHtml } from '@/lib/email-html'

function sanitize(html: string, options: Parameters<typeof sanitizeEmailHtml>[1] = {}) {
  return sanitizeEmailHtml(html, {
    window,
    baseOrigin: 'https://mail.example.test',
    trustedImageOrigins: ['https://attachments.example.test'],
    ...options,
  })
}

describe('email HTML safety boundary', () => {
  it('removes active content, event handlers, embedded documents and forms', () => {
    const clean = sanitize(`
      <script>globalThis.pwned = true</script>
      <img src="x" onerror="globalThis.pwned = true">
      <iframe srcdoc="<script>alert(1)</script>"></iframe>
      <form action="https://evil.test"><input name="password"></form>
      <object data="https://evil.test/payload"></object>
      <embed src="https://evil.test/payload">
    `)

    expect(clean).not.toMatch(/script|onerror|iframe|srcdoc|<form|<input|object|embed/i)
  })

  it('renders remote HTTPS images with privacy and loading attributes', () => {
    const clean = sanitize(`
      <img src="https://images.apple.example/hero.png"
           srcset="https://images.apple.example/hero.png 1x, https://images.apple.example/hero-2x.png 2x">
      <img src="http://insecure.example/pixel.gif">
      <img src="relative-tracker.gif">
    `)

    expect(clean).toContain('src="https://images.apple.example/hero.png"')
    expect(clean).toContain('srcset="https://images.apple.example/hero.png 1x, https://images.apple.example/hero-2x.png 2x"')
    expect(clean).toContain('referrerpolicy="no-referrer"')
    expect(clean).toContain('loading="lazy"')
    expect(clean).toContain('decoding="async"')
    expect(clean).not.toContain('http://insecure.example/pixel.gif')
    expect(clean).not.toContain('relative-tracker.gif')
  })

  it('supports a remote-image privacy opt-out while retaining trusted images', () => {
    const clean = sanitize(`
      <img src="https://tracker.test/pixel.gif">
      <img src="cid:logo@example.test">
      <img src="https://attachments.example.test/file.png">
    `, { allowRemoteImages: false })

    expect(clean).not.toContain('https://tracker.test/pixel.gif')
    expect(clean).toContain('remote-image-blocked')
    expect(clean).toContain('cid:logo@example.test')
    expect(clean).toContain('https://attachments.example.test/file.png')
  })

  it('keeps responsive layout CSS and strips network or overlay capabilities', () => {
    const clean = sanitize(`
      <style>
        .desktop { display: block; width: 600px; background: #fff; }
        .mobile { display: none; position: fixed; inset: 0; z-index: 999999; }
        .tracker { background-image: url(https://tracker.test/open); }
        @import url(https://tracker.test/styles.css);
        @media (max-width: 600px) {
          .desktop { display: none !important; }
          .mobile { display: block !important; width: 100% !important; }
        }
      </style>
      <div class="desktop" style="color:#123; padding:20px; background:url(https://tracker.test/inline)">Desktop</div>
      <div class="mobile">Mobile</div>
    `)

    expect(clean).toMatch(/<style>[\s\S]*\.desktop\s*\{[^}]*display:\s*block/i)
    expect(clean).toMatch(/@media\s*\(max-width:\s*600px\)/i)
    expect(clean).toMatch(/\.mobile\s*\{[^}]*display:\s*block\s*!important/i)
    expect(clean).not.toMatch(/tracker\.test|@import|position:|z-index:|background-image|url\s*\(/i)
  })

  it('normalizes safe links and strips executable or relative URLs', () => {
    const clean = sanitize(`
      <a href="javascript:alert(1)" target="_blank">unsafe</a>
      <a href="/logout" target="_top">relative</a>
      <a href="https://www.apple.com/app-store/">App Store</a>
      <a href="mailto:help@example.test" target="_top">Support</a>
    `)

    expect(clean).not.toContain('javascript:')
    expect(clean).not.toContain('href="/logout"')
    expect(clean).not.toContain('target="_top"')
    expect(clean).toContain('href="https://www.apple.com/app-store/"')
    expect(clean).toContain('target="_blank"')
    expect(clean).toContain('rel="noopener noreferrer"')
    expect(clean).toContain('href="mailto:help@example.test"')
  })

  it('renders sanitized markup inside an isolated Shadow DOM', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      observe = observe
      unobserve() {}
      disconnect = disconnect
    })
    const { container } = render(
      <EmailHtml html={'<p id="message">Hello</p><img src="https://images.example.test/logo.png" onerror="alert(1)">'} />,
    )
    const host = container.querySelector<HTMLElement>('[data-email-html-host]')
    expect(host?.shadowRoot).not.toBeNull()
    expect(host?.shadowRoot?.querySelector('#message')).toHaveTextContent('Hello')
    expect(host?.shadowRoot?.innerHTML).not.toContain('onerror')
    expect(host?.shadowRoot?.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(observe).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
