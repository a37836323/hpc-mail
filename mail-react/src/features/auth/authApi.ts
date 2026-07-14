import { api } from '@/api'

export interface AuthWebsiteConfig {
  title?: string
  register?: number
  regKey?: number
  registerVerify?: number
  regVerifyOpen?: boolean
  siteKey?: string
}

export interface LoginResponse { token: string }
export interface RegisterResponse { token?: string; username?: string; regVerifyOpen?: boolean }

export const authApi = {
  config: (signal?: AbortSignal) => api.get<AuthWebsiteConfig>('/setting/websiteConfig', { signal }),
  login: (username: string, password: string) => api.post<LoginResponse, { username: string; password: string }>('/login', { username, password }, { token: null }),
  register: (body: { username: string; displayName?: string; password: string; code?: string | null; token?: string }) =>
    api.post<RegisterResponse, typeof body>('/register', body, { token: null }),
}
