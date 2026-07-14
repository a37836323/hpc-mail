import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/app'
import '@/styles/index.css'

try {
  const preference = localStorage.getItem('hpc-mail:theme')
  const resolved = preference === 'light' || preference === 'dark'
    ? preference
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = resolved
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
} catch {
  // The CSS system preference remains the no-storage fallback.
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root application mount point')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
