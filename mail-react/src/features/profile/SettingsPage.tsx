import { type FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Save, Trash2, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, Input, toast,
} from '@/components/ui'
import { useAuthStore } from '@/stores/auth-store'
import { profileApi } from './profileApi'

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试。'
}

export function SettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const clearToken = useAuthStore((state) => state.clearToken)
  const [displayName, setDisplayName] = useState('')
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const profile = useQuery({ queryKey: ['profile'], queryFn: ({ signal }) => profileApi.current(signal) })

  useEffect(() => { if (profile.data) setDisplayName(profile.data.displayName || profile.data.username) }, [profile.data])

  const nameMutation = useMutation({
    mutationFn: () => profileApi.setDisplayName(displayName.trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast({ title: '显示名称已更新', variant: 'success' })
    },
    onError: (error) => toast({ title: '保存失败', description: messageOf(error), variant: 'error' }),
  })
  const passwordMutation = useMutation({
    mutationFn: () => profileApi.resetPassword(password),
    onSuccess: () => {
      setPasswordOpen(false); setPassword(''); setConfirmPassword('')
      toast({ title: '密码已更新', description: '下次登录请使用新密码。', variant: 'success' })
    },
    onError: (error) => toast({ title: '修改密码失败', description: messageOf(error), variant: 'error' }),
  })
  const deleteMutation = useMutation({
    mutationFn: profileApi.deleteAccount,
    onSuccess: () => { clearToken(); navigate('/login', { replace: true }) },
    onError: (error) => toast({ title: '删除账户失败', description: messageOf(error), variant: 'error' }),
  })

  function saveName(event: FormEvent) {
    event.preventDefault()
    const value = displayName.trim()
    if (!value || value.length > 50) {
      toast({ title: '显示名称需为 1–50 个字符', variant: 'error' }); return
    }
    nameMutation.mutate()
  }

  function savePassword(event: FormEvent) {
    event.preventDefault()
    if (password.length < 6) { toast({ title: '密码至少需要 6 个字符', variant: 'error' }); return }
    if (password !== confirmPassword) { toast({ title: '两次输入的密码不一致', variant: 'error' }); return }
    passwordMutation.mutate()
  }

  if (profile.isPending) return <main className="app-page"><div className="mx-auto max-w-5xl"><div className="h-56 animate-pulse rounded-[var(--radius-panel)] bg-slate-100" /></div></main>
  if (profile.isError) return <main className="app-page"><div className="mx-auto max-w-5xl"><div role="alert" className="rounded-[var(--radius-panel)] border border-red-200 bg-red-50 p-5 text-sm text-red-800">账户信息加载失败。<Button className="ml-3" size="sm" variant="secondary" onClick={() => void profile.refetch()}>重试</Button></div></div></main>

  return (
    <main className="app-page h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl pb-20 md:pb-0">
      <header className="mb-5"><p className="app-eyebrow">账户</p><h1 className="app-page-title mt-1">个人设置</h1><p className="app-page-description mt-1.5">管理平台身份与登录安全。邮箱地址在邮箱管理中统一维护。</p></header>
      <div className="grid gap-4">
        <section className="app-panel p-5 sm:p-6" aria-labelledby="identity-title">
          <div className="mb-5 flex items-center gap-3"><UserRound className="size-5 text-blue-600" /><div><h2 id="identity-title" className="font-semibold text-slate-950">平台身份</h2><p className="text-sm text-slate-500">用户名用于登录，不代表任何邮箱。</p></div></div>
          <dl className="mb-5 grid gap-1 border-y border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-[140px_1fr]"><dt className="text-sm text-slate-500">用户名</dt><dd className="break-all text-sm font-medium text-slate-900">{profile.data?.username}</dd></dl>
          <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={saveName}>
            <label className="grid gap-1.5 text-sm font-medium text-slate-800">显示名称<Input value={displayName} maxLength={50} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <Button type="submit" loading={nameMutation.isPending} disabled={displayName.trim() === (profile.data?.displayName || profile.data?.username)}><Save className="size-4" />保存</Button>
          </form>
        </section>
        <section className="app-panel p-5 sm:p-6" aria-labelledby="security-title">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><KeyRound className="size-5 text-slate-500" /><h2 id="security-title" className="font-semibold text-slate-950">登录安全</h2></div><p className="mt-1 text-sm text-slate-500">定期更换平台登录密码。</p></div><Button variant="secondary" onClick={() => setPasswordOpen(true)}>修改密码</Button></div>
        </section>
        <section className="rounded-[var(--radius-panel)] border border-red-200 bg-white p-5 sm:p-6" aria-labelledby="danger-title">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 id="danger-title" className="font-semibold text-slate-950">删除账户</h2><p className="mt-1 text-sm text-slate-600">永久删除平台账户及其数据，此操作无法恢复。</p></div><Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" />删除账户</Button></div>
        </section>
      </div>
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}><DialogContent><DialogHeader><DialogTitle>修改密码</DialogTitle><DialogDescription>新密码至少 6 个字符。</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={savePassword}><label className="grid gap-1.5 text-sm font-medium">新密码<Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium">确认新密码<Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label><DialogFooter><Button type="button" variant="secondary" onClick={() => setPasswordOpen(false)}>取消</Button><Button type="submit" loading={passwordMutation.isPending}>确认修改</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}><DialogContent><DialogHeader><DialogTitle>永久删除账户？</DialogTitle><DialogDescription>输入“删除账户”以确认。此操作无法撤销。</DialogDescription></DialogHeader><label className="grid gap-1.5 text-sm font-medium">确认文字<Input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} /></label><DialogFooter><Button variant="secondary" onClick={() => setDeleteOpen(false)}>取消</Button><Button variant="danger" disabled={deleteConfirm !== '删除账户'} loading={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>永久删除</Button></DialogFooter></DialogContent></Dialog>
      </div>
    </main>
  )
}
