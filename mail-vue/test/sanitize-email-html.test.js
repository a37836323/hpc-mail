import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { sanitizeEmailHtml } from '../src/utils/sanitize-email-html.js'

function sanitize(html, options = {}) {
  const dom = new JSDOM('', { url: 'https://mail.example.test/inbox' })
  return sanitizeEmailHtml(html, {
    window: dom.window,
    trustedImageOrigins: ['https://attachments.example.test'],
    ...options,
  })
}

describe('sanitizeEmailHtml', () => {
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

  it('renders remote HTTPS images without leaking a referrer', () => {
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
    expect(clean).not.toContain('http://insecure.example/pixel.gif')
    expect(clean).not.toContain('relative-tracker.gif')
  })

  it('supports a privacy opt-out while retaining inline and trusted images', () => {
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

  it('keeps responsive email layout CSS and removes dangerous CSS capabilities', () => {
    const clean = sanitize(`
      <style>
        .desktop { display: block; width: 600px; background: #fff; }
        .mobile { display: none; position: fixed; inset: 0; z-index: 999999; }
        .tracker { background-image: url(https://tracker.test/open); }
        @import url(https://tracker.test/styles.css);
        @font-face { font-family: Spy; src: url(https://tracker.test/font); }
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
    expect(clean).toMatch(/style="[^"]*color:\s*rgb\(17, 34, 51\);[^"]*padding:\s*20px/i)
    expect(clean).not.toMatch(/tracker\.test|@import|@font-face|position:|z-index:|background-image|url\s*\(/i)
  })

  it('normalizes safe links and strips executable URL schemes', () => {
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
})
