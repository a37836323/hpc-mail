import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Shield, Star, Trash2 } from 'lucide-react'
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast,
} from '@/components/ui'
import { AdminPage, EmptyState, ErrorState, LoadingState, messageOf, StatusBadge } from './AdminPageParts'
import { managementApi, type RoleInput } from './managementApi'
import type { AdminRole, PermissionNode } from './adminTypes'

function flattenPermissions(nodes: PermissionNode[], depth = 0): Array<PermissionNode & { depth: number }> {
  return nodes.flatMap((node) => [{ ...node, depth }, ...flattenPermissions(node.children || [], depth + 1)])
}
function parseList(value: string) { return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))] }

const emptyForm: RoleInput = { name: '', description: '', permIds: [], banEmail: [], banEmailType: 0, availDomain: [], sendCount: 0, sendType: 'count', accountCount: 0 }

export function RolesPage() {
  const queryClient = useQueryClient()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<AdminRole | null>(null)
  const [form, setForm] = useState<RoleInput>(emptyForm)
  const [banText, setBanText] = useState('')
  const [domainText, setDomainText] = useState('')
  const [deleteRole, setDeleteRole] = useState<AdminRole | null>(null)
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: ({ signal }) => managementApi.roles(signal) })
  const tree = useQuery({ queryKey: ['admin', 'permission-tree'], queryFn: ({ signal }) => managementApi.permissionTree(signal) })
  const permissions = useMemo(() => flattenPermissions(tree.data || []), [tree.data])
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
  const saveMutation = useMutation({
    mutationFn: (input: RoleInput) => input.roleId ? managementApi.updateRole(input) : managementApi.addRole(input),
    onSuccess: () => { setEditorOpen(false); void refresh(); toast({ title: editing ? '角色已更新' : '角色已创建', variant: 'success' }) },
    onError: (error) => toast({ title: '保存角色失败', description: messageOf(error), variant: 'error' }),
  })
  const defaultMutation = useMutation({
    mutationFn: managementApi.setDefaultRole,
    onSuccess: () => { void refresh(); toast({ title: '默认角色已更新', variant: 'success' }) },
    onError: (error) => toast({ title: '设置失败', description: messageOf(error), variant: 'error' }),
  })
  const deleteMutation = useMutation({
    mutationFn: managementApi.deleteRole,
    onSuccess: () => { setDeleteRole(null); void refresh(); toast({ title: '角色已删除', variant: 'success' }) },
    onError: (error) => toast({ title: '删除失败', description: messageOf(error), variant: 'error' }),
  })

  function openEditor(role?: AdminRole) {
    setEditing(role || null)
    setForm(role ? { roleId: role.roleId, name: role.name, description: role.description || '', permIds: role.permIds || [], banEmail: role.banEmail || [], banEmailType: role.banEmailType, availDomain: role.availDomain || [], sendCount: role.sendCount || 0, sendType: role.sendType || 'count', accountCount: role.accountCount || 0 } : emptyForm)
    setBanText((role?.banEmail || []).join('\n')); setDomainText((role?.availDomain || []).join('\n')); setEditorOpen(true)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) { toast({ title: '请输入角色名称', variant: 'error' }); return }
    saveMutation.mutate({ ...form, name: form.name.trim(), description: form.description.trim(), banEmail: parseList(banText), availDomain: parseList(domainText) })
  }
  function togglePermission(permId: number) { setForm((current) => ({ ...current, permIds: current.permIds.includes(permId) ? current.permIds.filter((id) => id !== permId) : [...current.permIds, permId] })) }

  return (
    <AdminPage title="权限控制" description="以角色集中管理平台功能权限、可用域名与发送限制。系统角色不可修改。" action={<Button onClick={() => openEditor()}><Plus className="size-4" />创建角色</Button>}>
      {roles.isPending ? <LoadingState label="正在加载角色" /> : roles.isError ? <ErrorState onRetry={() => void roles.refetch()} /> : !roles.data.length ? <EmptyState title="暂无角色" description="创建角色后即可分配给平台用户。" /> : <div className="grid gap-4 lg:grid-cols-2">{roles.data.map((role) => {
        const protectedRole = Boolean(role.isSystem || role.key === 'admin')
        return <article key={role.roleId} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Shield className="size-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-950">{role.name}</h2>{Boolean(role.isDefault) && <StatusBadge active activeText="默认" />}{protectedRole && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">系统</span>}</div><p className="mt-1 line-clamp-2 text-sm text-slate-500">{role.description || '暂无描述'}</p></div></div></div><dl className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-sm"><div><dt className="text-xs text-slate-500">权限</dt><dd className="mt-1 font-medium tabular-nums">{role.permIds.length}</dd></div><div><dt className="text-xs text-slate-500">可用域名</dt><dd className="mt-1 font-medium tabular-nums">{role.availDomain.length || '全部'}</dd></div><div><dt className="text-xs text-slate-500">发件额度</dt><dd className="mt-1 font-medium tabular-nums">{role.sendCount || '不限'}</dd></div></dl><div className="mt-4 flex flex-wrap gap-2">{!protectedRole && <Button size="sm" variant="secondary" onClick={() => openEditor(role)}>编辑</Button>}{!protectedRole && !role.isDefault && <Button size="sm" variant="ghost" loading={defaultMutation.isPending} onClick={() => defaultMutation.mutate(role.roleId)}><Star className="size-4" />设为默认</Button>}{!protectedRole && !role.isDefault && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setDeleteRole(role)}><Trash2 className="size-4" />删除</Button>}</div></article>
      })}</div>}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editing ? '编辑角色' : '创建角色'}</DialogTitle><DialogDescription>权限与域名限制会应用于分配此角色的所有用户。</DialogDescription></DialogHeader><form className="grid gap-5" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">角色名称<Input maxLength={50} value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} /></label><label className="grid gap-1.5 text-sm font-medium">发送额度类型<Select value={form.sendType || 'count'} onValueChange={(value) => setForm((current) => ({ ...current, sendType: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="count">总次数</SelectItem><SelectItem value="day">每日重置</SelectItem></SelectContent></Select></label></div>
        <label className="grid gap-1.5 text-sm font-medium">角色说明<textarea className="min-h-20 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">可用域名（每行一个）<textarea className="min-h-24 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="留空表示全部域名" value={domainText} onChange={(event) => setDomainText(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium">禁止的发件地址或域名<textarea className="min-h-24 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="支持邮箱、域名或 *" value={banText} onChange={(event) => setBanText(event.target.value)} /></label></div>
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">发送额度（0 表示不限）<Input type="number" min={0} value={form.sendCount || 0} onChange={(event) => setForm((value) => ({ ...value, sendCount: Number(event.target.value) }))} /></label><label className="grid gap-1.5 text-sm font-medium">最多管理邮箱数（0 表示不限）<Input type="number" min={0} value={form.accountCount || 0} onChange={(event) => setForm((value) => ({ ...value, accountCount: Number(event.target.value) }))} /></label></div>
        <fieldset><legend className="text-sm font-medium text-slate-800">功能权限</legend>{tree.isPending ? <p className="mt-2 text-sm text-slate-500">正在加载权限…</p> : <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 p-2">{permissions.map((permission) => <label key={permission.permId} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-50" style={{ paddingLeft: `${permission.depth * 16 + 8}px` }}><input type="checkbox" className="size-4 accent-blue-600" checked={form.permIds.includes(permission.permId)} onChange={() => togglePermission(permission.permId)} /><span>{permission.name}</span>{permission.permKey && <code className="ml-auto text-xs text-slate-400">{permission.permKey}</code>}</label>)}</div>}</fieldset>
        <DialogFooter><Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>取消</Button><Button type="submit" loading={saveMutation.isPending}>保存角色</Button></DialogFooter>
      </form></DialogContent></Dialog>
      <Dialog open={Boolean(deleteRole)} onOpenChange={(open) => { if (!open) setDeleteRole(null) }}><DialogContent><DialogHeader><DialogTitle>删除“{deleteRole?.name}”？</DialogTitle><DialogDescription>使用此角色的用户将转移到默认角色。此操作不可撤销。</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setDeleteRole(null)}>取消</Button><Button variant="danger" loading={deleteMutation.isPending} onClick={() => deleteRole && deleteMutation.mutate(deleteRole.roleId)}>确认删除</Button></DialogFooter></DialogContent></Dialog>
    </AdminPage>
  )
}
