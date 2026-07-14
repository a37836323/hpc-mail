import { useEffect, useMemo, useRef, useState, Suspense, type ComponentType } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AtSign,
  BarChart3,
  Braces,
  ChevronUp,
  FileKey2,
  FileText,
  Inbox,
  KeyRound,
  LogOut,
  Mail,
  MailSearch,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Sun,
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
import { useTheme, type ThemePreference } from './use-theme'

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
  { label: '分析页', path: '/admin/analytics', icon: BarChart3, permission: 'analysis:query' },
  { label: '用户列表', path: '/admin/users', icon: Users, permission: 'user:query' },
  { label: '全部邮件', path: '/admin/mail', icon: MailSearch, permission: 'all-email:query' },
  { label: '权限控制', path: '/admin/roles', icon: ShieldCheck, permission: 'role:query' },
  { label: '注册密钥', path: '/admin/invite-keys', icon: FileKey2, permission: 'reg-key:query' },
  { label: 'API 控制', path: '/admin/api', icon: Braces, permission: 'api-key:query' },
  { label: '系统设置', path: '/admin/system', icon: SlidersHorizontal, permission: 'setting:query' },
]

function RouteLoading() {
  return (
    <div className="grid h-full min-h-48 place-items-center" role="status" aria-live="polite">
      <span className="text-sm text-[var(--color-text-muted)]">正在打开页面…</span>
    </div>
  )
}

function navIsActive(currentPath: string, itemPath: string): boolean {
  if (itemPath === '/inbox' && currentPath === '/message') return true
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`)
}

function NavigationLink({ item, collapsed = false }: { item: NavigationItem; collapsed?: boolean }) {
  const location = useLocation()
  const active = navIsActive(location.pathname, item.path)
  const Icon = item.icon
  return (
    <NavLink
      to={item.path}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={[
        'flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-sm font-semibold outline-none transition-colors duration-[var(--motion-fast)]',
        'focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]',
        active
          ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]',
        collapsed ? 'justify-center' : 'gap-3',
      ].join(' ')}
    >
      <Icon className="size-5 shrink-0" strokeWidth={1.8} aria-hidden />
      {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
    </NavLink>
  )
}

const themeOptions: Array<{ value: ThemePreference; label: string; icon: ComponentType<LucideProps> }> = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
]

function UserMenu({ user, compact = false, placement = 'top' }: {
  user: SessionUser
  compact?: boolean
  placement?: 'top' | 'bottom'
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const clearToken = useAuthStore((state) => state.clearToken)
  const { theme, setTheme } = useTheme()
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
        className={[
          'flex min-h-11 w-full items-center rounded-[var(--radius-control)] text-left outline-none transition-colors',
          'hover:bg-[var(--color-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2',
          compact ? 'justify-center px-1' : 'gap-3 px-2',
        ].join(' ')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={compact ? name : undefined}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary)]" aria-hidden>
          {name.slice(0, 1).toUpperCase()}
        </span>
        {!compact && (
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm font-semibold text-[var(--color-text)]">{name}</strong>
            <span className="block truncate text-xs text-[var(--color-text-subtle)]">@{user.username}</span>
          </span>
        )}
        {!compact && <ChevronUp className={`size-4 text-[var(--color-text-subtle)] transition-transform ${open ? '' : 'rotate-180'}`} aria-hidden />}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="平台账户菜单"
          className={[
            'absolute z-[var(--z-dropdown)] w-64 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-2 shadow-[var(--shadow-popover)]',
            placement === 'top' ? 'bottom-[calc(100%+8px)] left-0' : 'right-0 top-[calc(100%+8px)]',
          ].join(' ')}
        >
          <div className="border-b border-[var(--color-border)] px-2 pb-2 pt-1">
            <p className="truncate text-sm font-semibold text-[var(--color-text)]">{name}</p>
            <p className="truncate text-xs text-[var(--color-text-muted)]">平台账户 · {user.username}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-2 text-sm text-[var(--color-text-muted)] outline-none hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            onClick={() => { setOpen(false); navigate('/settings') }}
          >
            <UserRound className="size-4.5" strokeWidth={1.8} aria-hidden />平台账户设置
          </button>
          <div className="my-1 border-y border-[var(--color-border)] py-1" aria-label="主题">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={theme === value}
                className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-2 text-sm text-[var(--color-text-muted)] outline-none hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                onClick={() => setTheme(value)}
              >
                <Icon className="size-4.5" strokeWidth={1.8} aria-hidden />
                <span className="flex-1 text-left">{label}</span>
                {theme === value && <span className="text-xs font-semibold text-[var(--color-primary)]">当前</span>}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-2 text-sm text-[var(--color-danger)] outline-none hover:bg-[var(--color-danger-soft)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut className="size-4.5" strokeWidth={1.8} aria-hidden />{logout.isPending ? '正在退出…' : '退出登录'}
          </button>
        </div>
      )}
    </div>
  )
}

function DesktopSidebar({ user, adminItems }: { user: SessionUser; adminItems: NavigationItem[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const sendAllowed = hasPermission(user, 'email:send')
  return (
    <aside
      className={[
        'hidden h-dvh shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] md:flex',
        'w-[72px]',
        collapsed ? 'lg:w-[72px]' : 'lg:w-[216px] xl:w-56',
      ].join(' ')}
      aria-label="主导航"
    >
      <div className={`flex h-16 shrink-0 items-center border-b border-[var(--color-border)] ${collapsed ? 'justify-center px-2' : 'gap-3 px-4 md:justify-center lg:justify-start'}`}>
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--color-primary)] text-[var(--color-on-primary)]">
          <Mail className="size-5" strokeWidth={1.8} aria-hidden />
        </span>
        {!collapsed && <strong className="hidden truncate text-base font-semibold text-[var(--color-text)] lg:block">HPC Mail</strong>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {sendAllowed && (
          <Button className={`mb-3 w-full ${collapsed ? 'px-0' : 'md:px-0 lg:px-4'}`} size="md" onClick={openComposer} aria-label="写邮件">
            <PenLine className="size-5 shrink-0" strokeWidth={1.8} aria-hidden />
            {!collapsed && <span className="hidden lg:inline">写邮件</span>}
          </Button>
        )}
        <nav className="grid gap-1" aria-label="邮件">
          {primaryNavigation
            .filter((item) => hasPermission(user, item.permission))
            .map((item) => <NavigationLink key={item.path} item={item} collapsed={collapsed} />)}
        </nav>
        {adminItems.length > 0 && (
          <div className="mt-5 border-t border-[var(--color-border)] pt-4">
            {!collapsed && <p className="mb-2 hidden px-3 text-xs font-semibold text-[var(--color-text-subtle)] lg:block">管理</p>}
            <nav className="grid gap-1" aria-label="管理">
              {adminItems.map((item) => <NavigationLink key={item.path} item={item} collapsed={collapsed} />)}
            </nav>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--color-border)] p-2">
        <UserMenu user={user} compact={collapsed} />
        <button
          type="button"
          className="mt-1 hidden min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] text-sm text-[var(--color-text-subtle)] outline-none hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] lg:flex"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
        >
          {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
          {!collapsed && <span>折叠侧栏</span>}
        </button>
      </div>
    </aside>
  )
}

function MobileHeader({ user }: { user: SessionUser }) {
  return (
    <header className="flex min-w-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 md:hidden">
      <span className="flex min-w-0 items-center gap-2 font-semibold text-[var(--color-text)]">
        <Mail className="size-5 shrink-0 text-[var(--color-primary)]" strokeWidth={1.8} aria-hidden />HPC Mail
      </span>
      <UserMenu user={user} compact placement="bottom" />
    </header>
  )
}

function MobileNavigation({ user }: { user: SessionUser }) {
  const location = useLocation()
  const sendAllowed = hasPermission(user, 'email:send')
  const navigationItem = (path: string) => primaryNavigation.find((item) => item.path === path)!
  const items = [
    navigationItem('/inbox'),
    navigationItem('/sent'),
    sendAllowed ? null : navigationItem('/starred'),
    navigationItem('/settings'),
  ].filter(Boolean) as NavigationItem[]
  const mobileLink = (item: NavigationItem) => {
    const Icon = item.icon
    const active = navIsActive(location.pathname, item.path)
    return (
      <NavLink key={item.path} to={item.path} className={`flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-focus)] ${active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`} aria-current={active ? 'page' : undefined}>
        <Icon className="size-5" strokeWidth={1.8} aria-hidden />{item.label}
      </NavLink>
    )
  }
  return (
    <nav className="grid grid-cols-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="移动导航">
      {items.slice(0, 2).map(mobileLink)}
      {sendAllowed ? (
        <button type="button" className="flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 text-xs font-semibold text-[var(--color-primary)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-focus)]" onClick={openComposer}>
          <PenLine className="size-5" strokeWidth={1.8} aria-hidden />写邮件
        </button>
      ) : items[2] ? (
        mobileLink(items[2])
      ) : null}
      {mobileLink(items.at(-1)!)}
    </nav>
  )
}

function SessionError({ onRetry }: { onRetry: () => void }) {
  const clearToken = useAuthStore((state) => state.clearToken)
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">无法载入工作台</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">网络连接或服务暂时不可用。重试不会清除当前会话。</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={onRetry}>重新加载</Button>
          <Button variant="secondary" onClick={clearToken}>返回登录</Button>
        </div>
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

  const adminItems = useMemo(
    () => session.data ? adminNavigation.filter((item) => hasPermission(session.data!, item.permission)) : [],
    [session.data],
  )

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const heading = contentRef.current?.querySelector<HTMLElement>('h1')
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
        heading.focus({ preventScroll: true })
      } else {
        contentRef.current?.focus({ preventScroll: true })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [location.pathname])

  useEffect(() => {
    if (!session.data) return
    let destination = ''
    try {
      destination = sessionStorage.getItem('hpc-mail:return-path') || ''
      sessionStorage.removeItem('hpc-mail:return-path')
    } catch {
      return
    }
    if (destination.startsWith('/') && !destination.startsWith('//') && destination !== `${location.pathname}${location.search}`) {
      navigate(destination, { replace: true })
    }
  }, [location.pathname, location.search, navigate, session.data])

  useEffect(() => {
    if (!session.data || !hasPermission(session.data, 'email:send')) return
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '')) return
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault()
        openComposer()
      }
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
      <div className="grid h-dvh min-w-0 grid-rows-[52px_minmax(0,1fr)_calc(60px+env(safe-area-inset-bottom))] overflow-hidden bg-[var(--color-canvas)] md:flex md:grid-rows-none">
        <DesktopSidebar user={session.data} adminItems={adminItems} />
        <MobileHeader user={session.data} />
        <div id="main-content" ref={contentRef} className="min-h-0 min-w-0 overflow-hidden outline-none md:flex-1" tabIndex={-1}>
          <Suspense fallback={<RouteLoading />}>
            <Outlet />
          </Suspense>
        </div>
        <MobileNavigation user={session.data} />
        {composerOpen && (
          <Suspense fallback={null}>
            <ComposeSheet />
          </Suspense>
        )}
      </div>
    </SessionContext.Provider>
  )
}
