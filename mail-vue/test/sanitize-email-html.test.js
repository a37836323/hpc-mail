import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { sanitizeEmailHtml } from '../src/utils/sanitize-email-html.js'

function sanitize(html) {
  const dom = new JSDOM('', { url: 'https://mail.example.test/inbox' })
  return sanitizeEmailHtml(html, {
    window: dom.window,
    trustedImageOrigins: ['https://attachments.example.test'],
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

  it('blocks dangerous links, remote tracking and malicious body styles', () => {
    const clean = sanitize(`
      <body style="background:url(https://tracker.test/open);position:fixed">
        <a href="javascript:alert(1)">unsafe</a>
        <img src="https://tracker.test/pixel.gif" srcset="https://tracker.test/2x.gif 2x">
        <img src="//tracker.test/protocol-relative.gif">
        <img src="cid:logo@example.test">
        <img src="https://attachments.example.test/file.png">
      </body>
    `)

    expect(clean).not.toMatch(/javascript:|style=|srcset=|tracker\.test/i)
    expect(clean).toContain('cid:logo@example.test')
    expect(clean).toContain('https://attachments.example.test/file.png')
  })
})
