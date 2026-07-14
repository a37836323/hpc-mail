import { clearAuthToken, getAuthToken } from '@/lib/auth-token'
import { ApiError, toApiError } from './errors'
import type { ApiEnvelope, ApiRequestOptions, QueryParams, QueryValue } from './types'

const DEFAULT_TIMEOUT_MS = 30_000

function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
}

function appendQueryValue(search: URLSearchParams, key: string, value: QueryValue): void {
  if (value === null || value === undefined) return
  search.append(key, String(value))
}

function withQuery(path: string, query?: QueryParams): string {
  if (!query) return path
  const [pathname, currentSearch = ''] = path.split('?', 2)
  const search = new URLSearchParams(currentSearch)
  for (const [key, value] of Object.entries(query) as [string, QueryValue | readonly QueryValue[]][]) {
    if (Array.isArray(value)) value.forEach((item) => appendQueryValue(search, key, item))
    else appendQueryValue(search, key, value as QueryValue)
  }
  const serialized = search.toString()
  return `${pathname ?? ''}${serialized ? `?${serialized}` : ''}`
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === 'string' ||
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
  )
}

function bodyAndHeaders(body: unknown, inputHeaders?: HeadersInit): { body?: BodyInit; headers: Headers } {
  const headers = new Headers(inputHeaders)
  if (body === undefined || body === null) return { headers }
  if (isBodyInit(body)) return { body, headers }
  headers.set('Content-Type', 'application/json')
  return { body: JSON.stringify(body), headers }
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new ApiError('服务器返回了无法识别的响应', {
      code: response.status || 502,
      httpStatus: response.status,
    })
  }
  const payload = (await response.json()) as Partial<ApiEnvelope<T>>
  if (typeof payload.code !== 'number' || typeof payload.message !== 'string') {
    throw new ApiError('服务器响应格式无效', {
      code: response.status || 502,
      httpStatus: response.status,
      payload,
    })
  }
  return payload as ApiEnvelope<T>
}

export async function apiRequest<TResponse, TBody = unknown>(
  method: string,
  path: string,
  options: ApiRequestOptions<TBody> = {},
): Promise<TResponse> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abortFromCaller()
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    const { body, headers } = bodyAndHeaders(options.body, options.headers)
    headers.set('Accept', 'application/json')
    headers.set('Accept-Language', globalThis.navigator?.language || 'zh-CN')
    const token = options.token === undefined ? getAuthToken() : options.token
    if (token) headers.set('Authorization', token)

    const response = await fetch(`${apiBaseUrl()}${withQuery(path, options.query)}`, {
      method,
      headers,
      body,
      signal: controller.signal,
      credentials: 'same-origin',
    })
    const envelope = await parseEnvelope<TResponse>(response)
    if (!response.ok || envelope.code !== 200) {
      const error = new ApiError(envelope.message || '请求失败', {
        code: envelope.code,
        httpStatus: response.status,
        payload: envelope.data,
      })
      if (error.unauthorized) clearAuthToken()
      throw error
    }
    return envelope.data as TResponse
  } catch (error) {
    throw toApiError(error)
  } finally {
    globalThis.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}

export const api = {
  get: <TResponse>(path: string, options?: Omit<ApiRequestOptions, 'body'>) =>
    apiRequest<TResponse>('GET', path, options),
  post: <TResponse, TBody = unknown>(path: string, body?: TBody, options?: Omit<ApiRequestOptions<TBody>, 'body'>) =>
    apiRequest<TResponse, TBody>('POST', path, { ...options, body }),
  put: <TResponse, TBody = unknown>(path: string, body?: TBody, options?: Omit<ApiRequestOptions<TBody>, 'body'>) =>
    apiRequest<TResponse, TBody>('PUT', path, { ...options, body }),
  delete: <TResponse>(path: string, options?: Omit<ApiRequestOptions, 'body'>) =>
    apiRequest<TResponse>('DELETE', path, options),
}
