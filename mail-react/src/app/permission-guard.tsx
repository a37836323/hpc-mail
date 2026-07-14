import type { ReactNode } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import { hasPermission, useSession } from './session-context'

export function PermissionGuard({ permission, children }: { permission: string; children: ReactNode }) {
  const user = useSession()
  if (hasPermission(user, permission)) return children
  return (
    <main className="grid h-full min-h-72 place-items-center px-4 py-12" tabIndex={-1}>
      <div className="max-w-md text-center">
        <LockKeyhole className="mx-auto size-8 text-[var(--color-text-subtle)]" strokeWidth={1.8} aria-hidden />
        <h1 className="mt-4 text-xl font-semibold text-[var(--color-text)]">无法访问此页面</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          当前平台账户没有所需权限。请联系管理员调整角色，或返回收件箱继续工作。
        </p>
        <Link className="mt-6 inline-flex min-h-11 items-center font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2" to="/inbox">
          返回收件箱
        </Link>
      </div>
    </main>
  )
}
