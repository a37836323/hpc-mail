import { createContext, useContext } from 'react'

export interface SessionUser {
  userId: number
  username: string
  displayName?: string
  name?: string
  permKeys?: string[]
  role?: {
    key?: string
    name?: string
  }
}

export const SessionContext = createContext<SessionUser | null>(null)

export function useSession(): SessionUser {
  const user = useContext(SessionContext)
  if (!user) throw new Error('useSession must be used inside the authenticated application shell')
  return user
}

export function hasPermission(user: SessionUser, permission?: string): boolean {
  if (!permission) return true
  const keys = user.permKeys ?? []
  return keys.includes('*') || keys.includes(permission)
}
