import { api } from '@/api'

export interface PlatformUser {
  userId: number
  username: string
  displayName: string
  name?: string
  type: number
  permKeys: string[]
}

export const profileApi = {
  current: (signal?: AbortSignal) => api.get<PlatformUser>('/my/loginUserInfo', { signal }),
  setDisplayName: (displayName: string) => api.put<{ displayName: string }, { displayName: string }>('/my/setDisplayName', { displayName }),
  resetPassword: (password: string) => api.put<void, { password: string }>('/my/resetPassword', { password }),
  deleteAccount: () => api.delete<void>('/my/delete'),
}
