import { type FormEvent, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, Search, ShieldCheck, UserRoundCog } from 'lucide-react'
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast,
} from '@/components/ui'
import { AdminPage, EmptyState, ErrorState, formatDate, LoadingState, messageOf, StatusBadge } from './AdminPageParts'
import { managementApi } from './managementApi'
import type { AdminUser } from './adminTypes'

const PAGE_SIZE = 20

export function UsersPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('-1')
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState('')

  const users = useQuery({
    queryKey: ['admin', 'users', page, query, status],
    queryFn: ({ signal }) => managementApi.users({ num: page, size: PAGE_SIZE, username: query, timeSort: 0, status: Number(status), isDel: 0 }, signal),
    placeholderData: keepPreviousData,
  })
  const roles = useQuery({ queryKey: ['admin', 'selectable-roles'], queryFn: ({ signal }) => managementApi.selectableRoles(signal) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  const statusMutation = useMutation({
    mutationFn: ({ userId, nextStatus }: { userId: number; nextStatus: number }) => managementApi.setUserStatus(userId, nextStatus),
    onSuccess: () => { void invalidate(); toast({ title: '用户状态已更新', variant: 'success' }) },
    onError: (error) => toast({ title: '更新失败', description: messageOf(error), variant: 'error' }),
  })
  const createMutation = useMutation({
    mutationFn: () => managementApi.addUser({ username: username.trim(), displayName: displayName.trim() || username.trim(), password, type: Number(roleId) }),
    onSuccess: () => { setCreateOpen(false); resetCreate(); void invalidate(); toast({ title: '用户已创建', variant: 'success' }) },
    onError: (error) => toast({ title: '创建失败', description: messageOf(error), variant: 'error' }),
  })
  const roleMutation = useMutation({
    mutationFn: ({ userId, type }: { userId: number; type: number }) => managementApi.setUserRole(userId, type),
    onSuccess: () => { setEditUser(null); void invalidate(); toast({ title: '角色已更新', variant: 'success' }) },
    onError: (error) => toast({ title: '更新角色失败', description: messageOf(error), variant: 'error' }),
  })

  function resetCreate() { setUsername(''); setDisplayName(''); setPassword(''); setRoleId('') }
  function submitCreate(event: FormEvent) {
    event.preventDefault()
    if (username.trim().length < 3 || password.length < 6 || !roleId) { toast({ title: '请完整填写有效的用户信息', variant: 'error' }); return }
    createMutation.mutate()
  }
  function submitSearch(event: FormEvent) { event.preventDefault(); setPage(1); setQuery(search.trim()) }
  const totalPages = Math.max(1, Math.ceil((users.data?.total || 0) / PAGE_SIZE))

  return (
    <AdminPage title="用户列表" description="平台用户与邮箱资源相互独立。这里仅管理登录身份、状态和角色。" action={<Button onClick={() => setCreateOpen(true)}><Plus className="size-4" />创建用户</Button>}>
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <form className="grid gap-3 sm:grid-cols-[minmax(200px,1fr)_180px_auto]" onSubmit={submitSearch}>
          <label className="relative"><span className="sr-only">搜索用户名</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="搜索用户名" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1) }}><SelectTrigger aria-label="用户状态"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="-1">全部状态</SelectItem><SelectItem value="0">正常</SelectItem><SelectItem value="1">已停用</SelectItem></SelectContent></Select>
          <Button type="submit" variant="secondary">筛选</Button>
        </form>
      </section>
      {users.isPending ? <LoadingState label="正在加载用户" /> : users.isError ? <ErrorState onRetry={() => void users.refetch()} /> : !users.data.list.length ? <EmptyState title="没有找到用户" /> : <>
        <div className="grid gap-3 md:hidden">{users.data.list.map((user) => <article key={user.userId} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-950">{user.displayName || user.username}</p><p className="truncate text-sm text-slate-500">@{user.username}</p></div><StatusBadge active={user.status === 0} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">角色</dt><dd className="mt-1">{user.roleName || '—'}</dd></div><div><dt className="text-slate-500">邮箱数</dt><dd className="mt-1">{user.accountCount ?? 0}</dd></div><div><dt className="text-slate-500">收件</dt><dd className="mt-1">{user.receiveEmailCount ?? 0}</dd></div><div><dt className="text-slate-500">最后活跃</dt><dd className="mt-1">{formatDate(user.activeTime)}</dd></div></dl><div className="mt-4 flex gap-2"><Button className="flex-1" size="sm" variant="secondary" onClick={() => { setEditUser(user); setRoleId(String(user.type)) }}><ShieldCheck className="size-4" />角色</Button><Button className="flex-1" size="sm" variant="secondary" loading={statusMutation.isPending} onClick={() => statusMutation.mutate({ userId: user.userId, nextStatus: user.status === 0 ? 1 : 0 })}>{user.status === 0 ? '停用' : '启用'}</Button></div></article>)}</div>
        <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block"><table className="w-full min-w-[860px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">用户</th><th className="px-4 py-3">角色</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">邮箱 / 收件 / 发件</th><th className="px-4 py-3">最后活跃</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{users.data.list.map((user) => <tr key={user.userId} className="hover:bg-slate-50"><td className="px-4 py-3"><p className="font-medium text-slate-900">{user.displayName || user.username}</p><p className="text-xs text-slate-500">@{user.username}</p></td><td className="px-4 py-3">{user.roleName || '—'}</td><td className="px-4 py-3"><StatusBadge active={user.status === 0} /></td><td className="px-4 py-3 tabular-nums text-slate-600">{user.accountCount ?? 0} / {user.receiveEmailCount ?? 0} / {user.sendEmailCount ?? 0}</td><td className="px-4 py-3 text-slate-600">{formatDate(user.activeTime)}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => { setEditUser(user); setRoleId(String(user.type)) }}>改角色</Button><Button size="sm" variant="ghost" loading={statusMutation.isPending} onClick={() => statusMutation.mutate({ userId: user.userId, nextStatus: user.status === 0 ? 1 : 0 })}>{user.status === 0 ? '停用' : '启用'}</Button></div></td></tr>)}</tbody></table></div>
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500"><span>共 {users.data.total} 位用户</span><div className="flex items-center gap-2"><Button size="icon" variant="secondary" disabled={page <= 1} aria-label="上一页" onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" /></Button><span className="tabular-nums">{page} / {totalPages}</span><Button size="icon" variant="secondary" disabled={page >= totalPages} aria-label="下一页" onClick={() => setPage((value) => value + 1)}><ChevronRight className="size-4" /></Button></div></div>
      </>}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreate() }}><DialogContent><DialogHeader><DialogTitle>创建平台用户</DialogTitle><DialogDescription>创建登录身份。邮箱可在之后单独分配和管理。</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={submitCreate}><label className="grid gap-1.5 text-sm font-medium">用户名<Input autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium">显示名称<Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium">初始密码<Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium">角色<Select value={roleId} onValueChange={setRoleId}><SelectTrigger><SelectValue placeholder="选择角色" /></SelectTrigger><SelectContent>{roles.data?.map((role) => <SelectItem key={role.roleId} value={String(role.roleId)}>{role.name}</SelectItem>)}</SelectContent></Select></label><DialogFooter><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>取消</Button><Button type="submit" loading={createMutation.isPending}>创建</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={Boolean(editUser)} onOpenChange={(open) => { if (!open) setEditUser(null) }}><DialogContent><DialogHeader><DialogTitle>修改用户角色</DialogTitle><DialogDescription>{editUser?.username} 将立即应用新角色权限。</DialogDescription></DialogHeader><label className="grid gap-1.5 text-sm font-medium">角色<Select value={roleId} onValueChange={setRoleId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roles.data?.map((role) => <SelectItem key={role.roleId} value={String(role.roleId)}>{role.name}</SelectItem>)}</SelectContent></Select></label><DialogFooter><Button variant="secondary" onClick={() => setEditUser(null)}>取消</Button><Button loading={roleMutation.isPending} disabled={!editUser || !roleId} onClick={() => editUser && roleMutation.mutate({ userId: editUser.userId, type: Number(roleId) })}><UserRoundCog className="size-4" />保存</Button></DialogFooter></DialogContent></Dialog>
    </AdminPage>
  )
}
