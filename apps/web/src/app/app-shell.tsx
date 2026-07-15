import { useQueryClient } from '@tanstack/react-query';
import {
  AtSign,
  ChevronDown,
  Inbox,
  KeyRound,
  Lock,
  LogOut,
  Mails,
  Menu,
  PenLine,
  Send,
  Settings,
  Star,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearAuthToken } from '@/lib/auth-token';
import { authApi } from '@/api/resources';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { usePublicConfig } from '@/lib/use-config';
import { useCurrentUser } from '@/lib/use-session';
import { ChangePasswordDialog } from './change-password-dialog';
import { PageLoader } from './page-loader';

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
}

const PRIMARY_NAV: NavEntry[] = [
  { to: '/inbox', label: '收件箱', icon: Inbox },
  { to: '/starred', label: '星标', icon: Star },
  { to: '/sent', label: '已发送', icon: Send },
  { to: '/compose', label: '写邮件', icon: PenLine },
  { to: '/mailboxes', label: '我的邮箱', icon: AtSign },
  { to: '/api-keys', label: 'API Keys', icon: KeyRound },
];

const ADMIN_NAV: NavEntry[] = [
  { to: '/admin/users', label: '用户', icon: Users },
  { to: '/admin/mail', label: '全站邮件', icon: Mails },
  { to: '/admin/invites', label: '邀请码', icon: Ticket },
  { to: '/admin/settings', label: '系统设置', icon: Settings },
];

const MOBILE_NAV: NavEntry[] = [
  { to: '/inbox', label: '收件箱', icon: Inbox },
  { to: '/starred', label: '星标', icon: Star },
  { to: '/compose', label: '写邮件', icon: PenLine },
  { to: '/mailboxes', label: '邮箱', icon: AtSign },
];

function SideLink({ entry, full, onNavigate }: { entry: NavEntry; full: boolean; onNavigate?: () => void }) {
  const Icon = entry.icon;
  return (
    <NavLink
      to={entry.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
          full ? 'justify-start' : 'justify-center lg:justify-start',
          isActive
            ? 'bg-accent-soft text-accent'
            : 'text-ink-secondary hover:bg-surface-hover hover:text-ink',
        )
      }
    >
      <Icon className="size-[18px] shrink-0" />
      <span className={full ? 'inline' : 'hidden lg:inline'}>{entry.label}</span>
    </NavLink>
  );
}

function NavSections({ isAdmin, full, onNavigate }: { isAdmin: boolean; full: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 p-2">
      {PRIMARY_NAV.map((entry) => (
        <SideLink key={entry.to} entry={entry} full={full} onNavigate={onNavigate} />
      ))}
      {isAdmin && (
        <>
          <p className={cn('px-3 pb-1 pt-4 text-xs font-semibold text-ink-tertiary', full ? 'block' : 'hidden lg:block')}>
            管理
          </p>
          {ADMIN_NAV.map((entry) => (
            <SideLink key={entry.to} entry={entry} full={full} onNavigate={onNavigate} />
          ))}
        </>
      )}
    </nav>
  );
}

function UserMenu() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [passwordOpen, setPasswordOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // 忽略：本地清理照常进行
    }
    clearAuthToken();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 text-sm text-ink transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold uppercase text-accent">
              {user.username.slice(0, 2)}
            </span>
            <span className="hidden max-w-32 truncate font-medium sm:inline">{user.username}</span>
            <ChevronDown className="size-4 text-ink-tertiary" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <div className="px-2.5 py-1.5">
            <p className="truncate text-sm font-medium text-ink">{user.username}</p>
            <p className="text-xs text-ink-tertiary">{user.role === 'admin' ? '管理员' : '普通用户'}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            <Lock className="size-4 text-ink-tertiary" />
            修改密码
          </DropdownMenuItem>
          <DropdownMenuItem tone="danger" onSelect={handleLogout}>
            <LogOut className="size-4" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}

export function AppShell() {
  const user = useCurrentUser();
  const { data: config } = usePublicConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = user.role === 'admin';
  const siteTitle = config?.siteTitle ?? 'HPC Mail';

  return (
    <div className="flex min-h-dvh flex-col bg-canvas md:flex-row">
      <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface md:flex md:w-16 lg:w-[220px]">
        <div className="flex h-14 items-center border-b border-line px-4 lg:px-5">
          <img src="/logo.png" alt="" className="size-7 shrink-0 rounded-md" />
          <span className="ml-2 hidden truncate text-sm font-semibold text-ink lg:inline">{siteTitle}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavSections isAdmin={isAdmin} full={false} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 md:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <IconButton aria-label="打开菜单" className="md:hidden">
                <Menu className="size-5" />
              </IconButton>
            </SheetTrigger>
            <SheetContent side="right" title={siteTitle}>
              <NavSections isAdmin={isAdmin} full onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <img src="/logo.png" alt="" className="size-7 shrink-0 rounded-md md:hidden" />
          <span className="truncate text-sm font-semibold text-ink md:hidden">{siteTitle}</span>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-4 md:px-6 md:pb-8">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface md:hidden">
        {MOBILE_NAV.map((entry) => {
          const Icon = entry.icon;
          return (
            <NavLink
              key={entry.to}
              to={entry.to}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-ink-tertiary',
                )
              }
            >
              <Icon className="size-5" />
              {entry.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
