import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'

export function AuthGuard() {
  const authenticated = useAuthStore((state) => state.authenticated)
  const location = useLocation()
  useEffect(() => {
    if (authenticated) return
    const destination = `${location.pathname}${location.search}`
    if (!destination.startsWith('//') && destination !== '/login') {
      try { sessionStorage.setItem('hpc-mail:return-path', destination) } catch { /* Storage is optional. */ }
    }
  }, [authenticated, location.pathname, location.search])
  if (!authenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  return <Outlet />
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const authenticated = useAuthStore((state) => state.authenticated)
  return authenticated ? <Navigate to="/inbox" replace /> : children
}
