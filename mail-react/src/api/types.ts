export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T | null
}

export type QueryValue = string | number | boolean | null | undefined
// Interfaces with named fields are valid query objects without requiring an
// unsafe index signature at each feature boundary.
export type QueryParams = object

export interface ApiRequestOptions<TBody = unknown> {
  body?: TBody
  headers?: HeadersInit
  query?: QueryParams
  signal?: AbortSignal
  timeoutMs?: number
  token?: string | null
}
