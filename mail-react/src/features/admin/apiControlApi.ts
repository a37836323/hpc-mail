import { api } from '@/api'
import type {
  ApiAuditResponse,
  ApiConfig,
  ApiKeyCreateInput,
  ApiKeyListResponse,
  ApiKeyRecord,
  ApiKeyStatus,
  ApiUserOption,
  CreatedApiKey,
  PublicApiEnvelope,
  PublicApiResult,
} from './apiControlTypes'

export const apiControlApi = {
  config: (signal?: AbortSignal) => api.get<ApiConfig>('/apiKey/config', { signal }),
  setConfig: (enabled: boolean) => api.put<ApiConfig, { enabled: boolean }>('/apiKey/setConfig', { enabled }),
  users: (signal?: AbortSignal) => api.get<ApiUserOption[]>('/apiKey/users', { signal }),
  keys: (params: { page: number; size: number; search?: string; status?: ApiKeyStatus | '' }, signal?: AbortSignal) =>
    api.get<ApiKeyListResponse>('/apiKey/list', { query: params, signal }),
  createKey: (input: ApiKeyCreateInput) => api.post<CreatedApiKey, ApiKeyCreateInput>('/apiKey/create', input),
  setKeyStatus: (apiKeyId: number, status: 0 | 1) =>
    api.put<ApiKeyRecord, { apiKeyId: number; status: 0 | 1 }>('/apiKey/status', { apiKeyId, status }),
  revokeKey: (apiKeyId: number) => api.delete<void>('/apiKey/delete', { query: { apiKeyId } }),
  audit: (params: { page: number; size: number; apiKeyId?: number }, signal?: AbortSignal) =>
    api.get<ApiAuditResponse>('/apiKey/audit', { query: params, signal }),
}

export interface PublicApiRequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

function sameOriginPublicApiUrl(path: string): URL {
  if (!path.startsWith('/') || path.startsWith('//') || /[\r\n]/.test(path)) {
    throw new Error('公共 API 路径无效')
  }
  const base = new URL('/api/v1/', window.location.origin)
  const url = new URL(path.replace(/^\/+/, ''), base)
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/v1/')) {
    throw new Error('测试器只能访问当前站点的 /api/v1')
  }
  return url
}

function presentBody(text: string): { body: string; data?: unknown } {
  if (!text) return { body: '(empty response)' }
  try {
    const parsed = JSON.parse(text) as unknown
    return { body: JSON.stringify(parsed, null, 2).slice(0, 20_000), data: parsed }
  } catch {
    return { body: text.slice(0, 20_000) }
  }
}

/**
 * Browser-local API key tester. This intentionally does not use the app API
 * client: no cookies, referrer, HTTP cache, retries, or persisted key state.
 */
export async function publicApiRequest<T>(secret: string, path: string, options: PublicApiRequestOptions = {}): Promise<PublicApiResult<T>> {
  const key = secret.trim()
  if (!key) throw new Error('请输入 API 密钥')
  const url = sameOriginPublicApiUrl(path)
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? 15_000
  const timeout = window.setTimeout(() => controller.abort(new DOMException('Timeout', 'AbortError')), timeoutMs)
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const method = options.method || 'GET'
  const startedAt = performance.now()

  try {
    const response = await window.fetch(url.href, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        'X-Request-ID': crypto.randomUUID(),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    const text = await response.text()
    const presented = presentBody(text)
    const parsed = presented.data as PublicApiEnvelope<T> | undefined
    return {
      ok: response.ok,
      status: response.status,
      method,
      path: `${url.pathname}${url.search}`,
      durationMs: Math.round(performance.now() - startedAt),
      requestId: response.headers.get('X-Request-ID') || parsed?.requestId || '',
      rateLimit: response.headers.get('X-RateLimit-Limit') || '',
      rateRemaining: response.headers.get('X-RateLimit-Remaining') || '',
      rateReset: response.headers.get('X-RateLimit-Reset') || '',
      body: presented.body,
      data: response.ok ? parsed?.data : undefined,
    }
  } catch (error) {
    const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
    return {
      ok: false,
      status: aborted ? 'timeout' : 'network-error',
      method,
      path: `${url.pathname}${url.search}`,
      durationMs: Math.round(performance.now() - startedAt),
      requestId: '',
      rateLimit: '',
      rateRemaining: '',
      rateReset: '',
      body: aborted ? `请求在 ${timeoutMs} ms 后超时` : error instanceof Error ? error.message : '网络请求失败',
    }
  } finally {
    window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
