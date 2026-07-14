import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { Button } from '@/components/ui'

export function RouteErrorPage() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  if (!notFound) console.error('Route rendering failed', error)
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--color-canvas)] px-4 py-12" tabIndex={-1}>
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-[var(--color-primary)]">{notFound ? '404' : '页面错误'}</p>
        <h1 className="mt-2 text-xl font-semibold text-[var(--color-text)]">{notFound ? '页面不存在' : '无法打开此页面'}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          {notFound ? '地址可能已更改，或页面已被移除。' : '页面模块加载失败或服务暂时不可用，请重新加载后再试。'}
        </p>
        <Button className="mt-6" onClick={() => window.location.reload()}>重新加载</Button>
        <Link className="ms-4 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary)]" to="/inbox">返回收件箱</Link>
      </div>
    </main>
  )
}
