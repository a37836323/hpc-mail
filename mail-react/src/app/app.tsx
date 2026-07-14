import { RouterProvider } from 'react-router-dom'
import { AppProviders } from './app-providers'
import { AppErrorBoundary } from './app-error-boundary'
import { router } from './router'

export function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </AppErrorBoundary>
  )
}
