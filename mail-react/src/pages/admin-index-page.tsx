import { Navigate } from 'react-router-dom'
import { hasPermission, useSession } from '@/app/session-context'
import { PermissionGuard } from '@/app/permission-guard'

const destinations = [
  ['analysis:query', '/admin/analytics'],
  ['user:query', '/admin/users'],
  ['all-email:query', '/admin/mail'],
  ['role:query', '/admin/roles'],
  ['reg-key:query', '/admin/invite-keys'],
  ['api-key:query', '/admin/api'],
  ['setting:query', '/admin/system'],
] as const

export function AdminIndexPage() {
  const user = useSession()
  const destination = destinations.find(([permission]) => hasPermission(user, permission))
  if (destination) return <Navigate to={destination[1]} replace />
  return <PermissionGuard permission="__admin__"><span /></PermissionGuard>
}
