import { create } from 'zustand'
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken,
  subscribeAuthToken,
} from '@/lib/auth-token'

interface AuthState {
  token: string | null
  authenticated: boolean
  setToken: (token: string) => void
  clearToken: () => void
}

export const useAuthStore = create<AuthState>((set) => {
  const token = getAuthToken()
  return {
    token,
    authenticated: Boolean(token),
    setToken: (nextToken) => {
      setAuthToken(nextToken)
      set({ token: nextToken.trim() || null, authenticated: Boolean(nextToken.trim()) })
    },
    clearToken: () => {
      clearAuthToken()
      set({ token: null, authenticated: false })
    },
  }
})

subscribeAuthToken((token) => {
  useAuthStore.setState({ token, authenticated: Boolean(token) })
})
