export interface ApiErrorOptions {
  code: number
  httpStatus?: number
  cause?: unknown
  payload?: unknown
}

export class ApiError extends Error {
  readonly code: number
  readonly httpStatus: number | null
  readonly payload: unknown

  constructor(message: string, options: ApiErrorOptions) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.code = options.code
    this.httpStatus = options.httpStatus ?? null
    this.payload = options.payload
  }

  get unauthorized(): boolean {
    return this.code === 401 || this.httpStatus === 401
  }

  get forbidden(): boolean {
    return this.code === 403 || this.httpStatus === 403
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError('请求超时，请稍后重试', { code: 408, cause: error })
  }
  if (error instanceof Error) {
    return new ApiError(error.message || '网络请求失败', { code: 0, cause: error })
  }
  return new ApiError('未知请求错误', { code: 0, payload: error })
}
