import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(path) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

describe('API control browser tester', () => {
  it('uses an isolated in-memory fetch client for API keys', () => {
    const tester = source('../src/views/api-control/ApiKeyTester.vue')

    expect(tester).toContain('window.fetch')
    expect(tester).toContain("credentials: 'omit'")
    expect(tester).toContain("cache: 'no-store'")
    expect(tester).toContain("referrerPolicy: 'no-referrer'")
    expect(tester).toContain('AbortController')
    expect(tester).not.toContain('localStorage')
    expect(tester).not.toContain('sessionStorage')
    expect(tester).not.toContain("@/axios")
  })

  it('covers inbox filters and both supported sender contracts', () => {
    const tester = source('../src/views/api-control/ApiKeyTester.vue')

    expect(tester).toContain("apiRequest('/mailboxes?limit=30')")
    expect(tester).toContain("apiRequest('/domains')")
    expect(tester).toContain("query.set('mailboxId', mailboxId.value)")
    expect(tester).toContain('{ mailboxId: Number(sendForm.mailboxId) }')
    expect(tester).toContain('{ localPart: sendForm.localPart, domain: sendForm.domain }')
    expect(tester).toContain('ElMessageBox.confirm')
  })
})

describe('Feishu settings UI', () => {
  it('provides save and saved-credential test controls without exposing secrets', () => {
    const settings = source('../src/views/sys-setting/index.vue')
    const request = source('../src/request/setting.js')

    expect(settings).toContain('feishuBotSecretConfigured')
    expect(settings).toContain('type="password"')
    expect(settings).toContain('sendFeishuTest')
    expect(request).toContain("http.post('/setting/testFeishu')")
  })
})
