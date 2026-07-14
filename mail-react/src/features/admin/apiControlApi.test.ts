import { afterEach, describe, expect, it, vi } from 'vitest'
import { publicApiRequest } from './apiControlApi'

function apiResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({ data, requestId: 'body-request-id' }), {
    status: 200,
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': 'header-request-id',
      'X-RateLimit-Limit': '60',
      'X-RateLimit-Remaining': '59',
      'X-RateLimit-Reset': '123456',
      ...init.headers,
    },
  })
}

describe('browser-local public API client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('targets only the current origin /api/v1 and omits browser credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiResponse({ status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await publicApiRequest('hpc_live_secret', '/status')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new URL(url).origin).toBe(window.location.origin)
    expect(new URL(url).pathname).toBe('/api/v1/status')
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    })
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer hpc_live_secret')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(result).toMatchObject({
      ok: true,
      status: 200,
      requestId: 'header-request-id',
      rateLimit: '60',
      rateRemaining: '59',
      rateReset: '123456',
      data: { status: 'ok' },
    })
  })

  it('rejects absolute, protocol-relative and path traversal targets before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(publicApiRequest('secret', 'https://evil.example/status')).rejects.toThrow('路径无效')
    await expect(publicApiRequest('secret', '//evil.example/status')).rejects.toThrow('路径无效')
    await expect(publicApiRequest('secret', '/../admin')).rejects.toThrow('只能访问当前站点')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends JSON without cookies and keeps the secret out of the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiResponse({ id: 9 }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await publicApiRequest('hpc_live_secret', '/messages', {
      method: 'POST',
      body: {
        from: { localPart: 'notice', domain: 'hpc.email' },
        to: ['user@example.com'],
        subject: 'Test',
        text: 'Hello',
      },
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.credentials).toBe('omit')
    expect(String(init.body)).not.toContain('hpc_live_secret')
    expect(JSON.parse(String(init.body))).toMatchObject({ from: { localPart: 'notice', domain: 'hpc.email' } })
  })

  it('returns structured HTTP errors for inspection instead of leaking into the app client', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'denied-id' },
    })))

    const result = await publicApiRequest('invalid-key', '/domains')
    expect(result).toMatchObject({ ok: false, status: 403, requestId: 'denied-id' })
    expect(result.body).toContain('Forbidden')
  })
})
