import { Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AuthGuard, PublicOnly } from './auth-guard'
import { AppShell } from './app-shell'
import { PermissionGuard } from './permission-guard'
import { RouteErrorPage } from './route-error-page'
import {
  AllMailPage,
  AnalyticsPage,
  ApiControlPage,
  DraftsPage,
  InboxPage,
  InviteKeysPage,
  LoginPage,
  MailboxManagerPage,
  MessagePage,
  RolesPage,
  SentPage,
  SettingsPage,
  StarredPage,
  SystemSettingsPage,
  UsersPage,
} from './route-modules'
import { AdminIndexPage } from '@/pages/admin-index-page'
import { NotFoundPage } from '@/pages/not-found-page'

function LoginRoute() {
  return (
    <PublicOnly>
      <Suspense fallback={<main className="grid min-h-dvh place-items-center text-sm text-[var(--color-text-muted)]">正在打开登录…</main>}>
        <LoginPage />
      </Suspense>
    </PublicOnly>
  )
}

function permitted(permission: string, page: React.ReactNode) {
  return <PermissionGuard permission={permission}>{page}</PermissionGuard>
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/inbox" replace /> },
  { path: '/login', element: <LoginRoute />, errorElement: <RouteErrorPage /> },
  {
    element: <AuthGuard />,
    errorElement: <RouteErrorPage />,
    children: [{
      element: <AppShell />,
      children: [
        { path: '/inbox', element: <InboxPage /> },
        { path: '/sent', element: <SentPage /> },
        { path: '/drafts', element: <DraftsPage /> },
        { path: '/starred', element: <StarredPage /> },
        { path: '/mailboxes', element: permitted('account:query', <MailboxManagerPage />) },
        { path: '/message', element: <MessagePage /> },
        { path: '/settings', element: <SettingsPage /> },
        { path: '/admin', element: <AdminIndexPage /> },
        { path: '/admin/analytics', element: permitted('analysis:query', <AnalyticsPage />) },
        { path: '/admin/users', element: permitted('user:query', <UsersPage />) },
        { path: '/admin/mail', element: permitted('all-email:query', <AllMailPage />) },
        { path: '/admin/roles', element: permitted('role:query', <RolesPage />) },
        { path: '/admin/invite-keys', element: permitted('reg-key:query', <InviteKeysPage />) },
        { path: '/admin/api', element: permitted('api-key:query', <ApiControlPage />) },
        { path: '/admin/system', element: permitted('setting:query', <SystemSettingsPage />) },
        { path: '*', element: <NotFoundPage /> },
      ],
    }],
  },
], {
  future: {
    v8_middleware: true,
  },
})
