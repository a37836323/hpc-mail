import { createContext, useContext, useEffect, type ReactNode } from 'react'

export type ThemePreference = 'light'

interface ThemeState {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.theme = 'light'
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = 'light'
    try { localStorage.removeItem('hpc-mail:theme') } catch { /* Storage can be unavailable. */ }
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', '#f4f7fc')
  }, [])

  return <ThemeContext.Provider value={{ theme: 'light', setTheme: () => undefined }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
