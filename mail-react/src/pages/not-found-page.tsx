import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="text-sm font-semibold text-blue-600">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">页面不存在</h1>
        <Link className="mt-5 inline-flex text-sm font-medium text-blue-600 hover:text-blue-700" to="/">
          返回首页
        </Link>
      </div>
    </main>
  )
}
