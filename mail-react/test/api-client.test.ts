import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api'
import { ApiError } from '@/api/errors'
import { TOKEN_STORAGE_KEY } from '@/lib/auth-token'

describe('typed API client', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses the existing /api envelope, token header, query params, and JSON body', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'session-token')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 200,
      message: 'success',
      data: { saved: true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.post<{ saved: boolean }, { name: string }>('/setting/test', { name: 'HPC Mail' }, {
      query: { dryRun: true },
    })).resolves.toEqual({ saved: true })

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/setting/test?dryRun=true')
    expect(new Headers(request.headers).get('Authorization')).toBe('session-token')
    expect(new Headers(request.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(request.body))).toEqual({ name: 'HPC Mail' })
  })

  it('maps envelope errors and removes expired authentication', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'expired-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 401,
      message: '身份认证失效',
      data: null,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const error = await api.get('/my/loginUserInfo').catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 401, unauthorized: true })
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('rejects a malformed non-envelope response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    })))

    await expect(api.get('/setting/query')).rejects.toMatchObject({ code: 502, httpStatus: 502 })
  })
})
