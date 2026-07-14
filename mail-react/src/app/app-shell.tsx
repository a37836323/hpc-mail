import { Suspense, type ComponentType, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AtSign,
  BarChart3,
  Braces,
  ChevronDown,
  FileKey2,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  MailSearch,
  PenLine,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  UserRound,
  Users,
  type LucideProps,
} from 'lucide-react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api'
import { Button } from '@/components/ui'
import { openComposer, useComposerStore } from '@/features/composer/composerStore'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'
import { ComposeSheet } from './route-modules'
import { hasPermission, SessionContext, type SessionUser } from './session-context'

interface NavigationItem {
  label: string
  path: string
  icon: ComponentType<LucideProps>
  permission?: string
}

const primaryNavigation: NavigationItem[] = [
  { label: '收件箱', path: '/inbox', icon: Inbox },
  { label: '已发送', path: '/sent', icon: Send },
  { label: '草稿箱', path: '/drafts', icon: FileText },
  { label: '星标邮件', path: '/starred', icon: Star },
  { label: '邮箱管理', path: '/mailboxes', icon: AtSign, permission: 'account:query' },
  { label: '个人设置', path: '/settings', icon: Settings },
]

const adminNavigation: NavigationItem[] = [
  { label: '数据概览', path: '/admin/analytics', icon: BarChart3, permission: 'analysis:query' },
  { label: '用户管理', path: '/admin/users', icon: Users, permission: 'user:query' },
  { label: '邮件审计', path: '/admin/mail', icon: MailSearch, permission: 'all-email:query' },
  { label: '角色权限', path: '/admin/roles', icon: ShieldCheck, permission: 'role:query' },
  { label: '注册密钥', path: '/admin/invite-keys', icon: FileKey2, permission: 'reg-key:query' },
  { label: 'API 控制', path: '/admin/api', icon: Braces, permission: 'api-key:query' },
  { label: '系统设置', path: '/admin/system', icon: SlidersHorizontal, permission: 'setting:query' },
]

function RouteLoading() {
  return (
    <div className="app-page" role="status" aria-live="polite">
      <div className="mx-auto grid h-full max-w-[1480px] content-start gap-3">
        <div className="h-7 w-36 animate-pulse rounded-md bg-slate-200" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-slate-200" />
        <div className="app-panel mt-2 min-h-64 animate-pulse bg-white" />
      </div>
      <span className="sr-only">正在打开页面…</span>
    </div>
  )
}

function navIsActive(currentPath: string, itemPath: string): boolean {
  if (itemPath === '/inbox' && currentPath === '/message') return true
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`)
}

function NavigationLink({ item }: { item: NavigationItem }) {
  const location = useLocation()
  const active = navIsActive(location.pathname, item.path)
  const Icon = item.icon
  return (
    <NavLink
      to={item.path}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      className={[
        'group relative flex min-h-10 items-center justify-center rounded-[var(--radius-control)] px-2 text-sm font-medium outline-none transition-colors duration-[var(--motion-fast)] lg:justify-start lg:gap-2.5 lg:px-3',
        'focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
      ].join(' ')}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2 : 1.7} aria-hidden />
      <span className="hidden min-w-0 truncate lg:block">{item.label}</span>
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-blue-600" aria-hidden />}
    </NavLink>
  )
}

function UserMenu({ user, compact = false }: { user: SessionUser; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const clearToken = useAuthStore((state) => state.clearToken)
  const hasAdminAccess = adminNavigation.some((item) => hasPermission(user, item.permission))
  const logout = useMutation({
    mutationFn: () => api.delete<void>('/logout'),
    onSettled: () => {
      queryClient.clear()
      clearToken()
      navigate('/login', { replace: true })
    },
  })

  useEffect(() => {
    if (!open) return
    const closeOnPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnPointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const name = user.displayName || user.name || user.username
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-1.5 text-left outline-none transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700" aria-hidden>
          {name.slice(0, 1).toUpperCase()}
        </span>
        {!compact && (
          <span className="hidden min-w-0 md:block">
            <strong className="block max-w-32 truncate text-sm font-semibold text-slate-900">{name}</strong>
            <span className="block max-w-32 truncate text-[11px] text-slate-500">平台账户</span>
          </span>
        )}
        {!compact && <ChevronDown className={`hidden size-4 text-slate-400 transition-transform md:block ${open ? 'rotate-180' : ''}`} aria-hidden />}
      </button>

      {open && (
        <div role="menu" aria-label="平台账户菜单" className="absolute right-0 top-[calc(100%+8px)] z-[var(--z-dropdown)] w-64 rounded-[var(--radius-panel)] border border-slate-200 bg-white p-2 shadow-[var(--shadow-popover)]">
          <div className="border-b border-slate-200 px-2 pb-2 pt-1">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <p className="truncate text-xs text-slate-500">用户名 · {user.username}</p>
          </div>
          <button type="button" role="menuitem" className="mt-1 flex min-h-10 w-full items-center gap-3 rounded-[var(--radius-control)] px-2 text-sm text-slate-600 outline-none hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => { setOpen(false); navigate('/settings') }}>
            <UserRound className="size-4.5" strokeWidth={1.7} aria-hidden />个人设置
          </button>
          {hasAdminAccess && (
            <button type="button" role="menuitem" className="flex min-h-10 w-full items-center gap-3 rounded-[var(--radius-control)] px-2 text-sm text-slate-600 outline-none hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => { setOpen(false); navigate('/admin') }}>
              <LayoutDashboard className="size-4.5" strokeWidth={1.7} aria-hidden />管理后台
            </button>
          )}
          <div className="my-1 border-t border-slate-200 pt-1">
            <button type="button" role="menuitem" className="flex min-h-10 w-full items-center gap-3 rounded-[var(--radius-control)] px-2 text-sm text-red-600 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-blue-500" disabled={logout.isPending} onClick={() => logout.mutate()}>
              <LogOut className="size-4.5" strokeWidth={1.7} aria-hidden />{logout.isPending ? '正在退出…' : '退出登录'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DesktopHeader({ user, adminItems }: { user: SessionUser; adminItems: NavigationItem[] }) {
  const sendAllowed = hasPermission(user, 'email:send')
  const mailboxAllowed = hasPermission(user, 'account:query')
  return (
    <header className="col-span-2 hidden h-14 items-center border-b border-slate-200 bg-white md:flex">
      <NavLink to="/inbox" className="flex h-full w-[72px] shrink-0 items-center justify-center border-r border-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 lg:w-[188px] lg:justify-start lg:gap-2.5 lg:px-4">
        <span className="grid size-8 place-items-center rounded-[var(--radius-control)] bg-blue-600 text-white">
          <Mail className="size-[18px]" strokeWidth={1.9} aria-hidden />
        </span>
        <strong className="hidden text-[15px] font-bold tracking-tight text-slate-950 lg:block">HPC Mail</strong>
      </NavLink>
      <nav className="flex h-full min-w-0 items-center gap-1 px-3" aria-label="快捷入口">
        <NavLink to="/inbox" className="flex min-h-9 items-center rounded-md px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">邮件</NavLink>
        {mailboxAllowed && <NavLink to="/mailboxes" className="flex min-h-9 items-center rounded-md px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">邮箱</NavLink>}
        {adminItems.length > 0 && <NavLink to="/admin" className="flex min-h-9 items-center rounded-md px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">管理</NavLink>}
      </nav>
      <div className="ml-auto flex items-center gap-2 px-3">
        {sendAllowed && (
          <Button size="sm" onClick={openComposer}>
            <PenLine className="size-4" strokeWidth={1.8} aria-hidden />写邮件
          </Button>
        )}
        <UserMenu user={user} />
      </div>
    </header>
  )
}

function DesktopSidebar({ user, adminItems }: { user: SessionUser; adminItems: NavigationItem[] }) {
  return (
    <aside className="hidden min-h-0 border-r border-slate-200 bg-white md:flex md:flex-col" aria-label="主导航">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <p className="mb-1 hidden px-3 text-[11px] font-medium text-slate-400 lg:block">邮件</p>
        <nav className="grid gap-0.5" aria-label="邮件功能">
          {primaryNavigation.filter((item) => hasPermission(user, item.permission)).map((item) => <NavigationLink key={item.path} item={item} />)}
        </nav>
        {adminItems.length > 0 && (
          <div className="mt-4 border-t border-slate-200 pt-3">
            <p className="mb-1 hidden px-3 text-[11px] font-medium text-slate-400 lg:block">平台管理</p>
            <nav className="grid gap-0.5" aria-label="平台管理">
              {adminItems.map((item) => <NavigationLink key={item.path} item={item} />)}
            </nav>
          </div>
        )}
      </div>
      <div className="border-t border-slate-200 px-3 py-2 text-center text-[11px] text-slate-400 lg:text-left">
        <span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-600" aria-hidden /><span className="hidden lg:inline">服务运行正常</span></span>
      </div>
    </aside>
  )
}

function MobileHeader({ user }: { user: SessionUser }) {
  const sendAllowed = hasPermission(user, 'email:send')
  return (
    <header className="flex min-w-0 items-center border-b border-slate-200 bg-white px-3 md:hidden">
      <NavLink to="/inbox" className="flex min-w-0 items-center gap-2 font-bold text-slate-950">
        <span className="grid size-8 place-items-center rounded-[var(--radius-control)] bg-blue-600 text-white"><Mail className="size-[18px]" aria-hidden /></span>
        <span>HPC Mail</span>
      </NavLink>
      <div className="ml-auto flex items-center gap-1">
        {sendAllowed && <Button size="icon" variant="ghost" aria-label="写邮件" onClick={openComposer}><PenLine className="size-5" aria-hidden /></Button>}
        <UserMenu user={user} compact />
      </div>
    </header>
  )
}

function MobileNavigation({ user }: { user: SessionUser }) {
  const location = useLocation()
  const sendAllowed = hasPermission(user, 'email:send')
  const items: NavigationItem[] = [primaryNavigation[0]!, primaryNavigation[1]!, primaryNavigation[3]!, primaryNavigation[5]!]
  return (
    <nav className="grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="移动导航">
      {items.map((item, index) => {
        const Icon = item.icon
        const active = navIsActive(location.pathname, item.path)
        if (index === 2 && sendAllowed) {
          return <button key="compose" type="button" className="flex min-h-[60px] flex-col items-center justify-center gap-1 text-xs font-semibold text-blue-700 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500" onClick={openComposer}><PenLine className="size-5" strokeWidth={1.8} aria-hidden />写邮件</button>
        }
        return <NavLink key={item.path} to={item.path} aria-current={active ? 'page' : undefined} className={`relative flex min-h-[60px] flex-col items-center justify-center gap-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${active ? 'text-blue-700' : 'text-slate-500'}`}><Icon className="size-5" strokeWidth={active ? 2 : 1.7} aria-hidden />{item.label}{active && <span className="absolute inset-x-[30%] top-0 h-0.5 rounded-full bg-blue-600" aria-hidden />}</NavLink>
      })}
    </nav>
  )
}

function SessionError({ onRetry }: { onRetry: () => void }) {
  const clearToken = useAuthStore((state) => state.clearToken)
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-4 py-12">
      <div className="app-panel max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-950">无法载入工作台</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">网络连接或服务暂时不可用。重试不会清除当前会话。</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2"><Button onClick={onRetry}>重新加载</Button><Button variant="secondary" onClick={clearToken}>返回登录</Button></div>
      </div>
    </main>
  )
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAuthStore((state) => state.token)
  const authenticated = useAuthStore((state) => state.authenticated)
  const composerOpen = useComposerStore((state) => state.open)
  const contentRef = useRef<HTMLDivElement>(null)
  const session = useQuery({
    queryKey: ['session', 'user', token],
    queryFn: ({ signal }) => api.get<SessionUser>('/my/loginUserInfo', { signal }),
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.unauthorized) && count < 2,
  })
  const adminItems = useMemo(() => session.data ? adminNavigation.filter((item) => hasPermission(session.data!, item.permission)) : [], [session.data])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const heading = contentRef.current?.querySelector<HTMLElement>('h1')
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
        heading.focus({ preventScroll: true })
      } else contentRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [location.pathname])

  useEffect(() => {
    if (!session.data) return
    let destination = ''
    try {
      destination = sessionStorage.getItem('hpc-mail:return-path') || ''
      sessionStorage.removeItem('hpc-mail:return-path')
    } catch { return }
    if (destination.startsWith('/') && !destination.startsWith('//') && destination !== `${location.pathname}${location.search}`) navigate(destination, { replace: true })
  }, [location.pathname, location.search, navigate, session.data])

  useEffect(() => {
    if (!session.data || !hasPermission(session.data, 'email:send')) return
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '')) return
      if (event.key.toLowerCase() === 'c') { event.preventDefault(); openComposer() }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [session.data])

  if (!authenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  if (session.isPending) return <RouteLoading />
  if (session.isError || !session.data) return <SessionError onRetry={() => void session.refetch()} />

  return (
    <SessionContext.Provider value={session.data}>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <div className="grid h-dvh min-w-0 grid-cols-1 grid-rows-[52px_minmax(0,1fr)_calc(60px+env(safe-area-inset-bottom))] overflow-hidden bg-slate-50 md:grid-cols-[72px_minmax(0,1fr)] md:grid-rows-[56px_minmax(0,1fr)] lg:grid-cols-[188px_minmax(0,1fr)]">
        <DesktopHeader user={session.data} adminItems={adminItems} />
        <MobileHeader user={session.data} />
        <DesktopSidebar user={session.data} adminItems={adminItems} />
        <div id="main-content" ref={contentRef} className="min-h-0 min-w-0 overflow-hidden bg-slate-50 outline-none" tabIndex={-1}>
          <Suspense fallback={<RouteLoading />}><Outlet /></Suspense>
        </div>
        <MobileNavigation user={session.data} />
        {composerOpen && <Suspense fallback={null}><ComposeSheet /></Suspense>}
      </div>
    </SessionContext.Provider>
  )
}
