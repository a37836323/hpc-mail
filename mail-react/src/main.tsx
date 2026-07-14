import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/app'
import '@/styles/index.css'

document.documentElement.dataset.theme = 'light'
document.documentElement.classList.remove('dark')
document.documentElement.style.colorScheme = 'light'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root application mount point')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
