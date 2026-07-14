import { afterEach, describe, expect, it, vi } from 'vitest'
import { mailboxApi } from './mailboxApi'

function response(data: unknown): Response {
  return new Response(JSON.stringify({ code: 200, message: 'success', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('mailbox management API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('creates a composed address and forwards the Turnstile token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ accountId: 8, email: 'support@hpc.email', name: 'support', sort: 0, addVerifyOpen: true }))
    vi.stubGlobal('fetch', fetchMock)

    const created = await mailboxApi.create('support@hpc.email', 'turnstile-token')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/account/add')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'support@hpc.email', token: 'turnstile-token' })
    expect(created.addVerifyOpen).toBe(true)
  })

  it('uses the existing rename, pin and delete contracts', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => response(null))
    vi.stubGlobal('fetch', fetchMock)

    await mailboxApi.rename(8, 'Support')
    await mailboxApi.pin(8)
    await mailboxApi.remove(8)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/account/setName')
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({ accountId: 8, name: 'Support' })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/account/setAsTop')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/account/delete?accountId=8')
  })
})
