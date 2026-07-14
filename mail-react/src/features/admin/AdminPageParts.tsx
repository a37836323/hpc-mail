import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui'

export function AdminPage({ eyebrow = '管理后台', title, description, action, children }: { eyebrow?: string; title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return <main className="mx-auto w-full max-w-7xl p-4 pb-24 sm:p-6 lg:p-8"><header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-blue-700">{eyebrow}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p></div>{action}</header>{children}</main>
}

export function LoadingState({ label = '正在加载' }: { label?: string }) { return <div className="grid min-h-48 place-items-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500"><span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />{label}</span></div> }
export function ErrorState({ onRetry }: { onRetry: () => void }) { return <div role="alert" className="grid min-h-48 place-items-center rounded-2xl border border-red-200 bg-red-50 p-6 text-center"><div><AlertCircle className="mx-auto mb-2 size-6 text-red-600" /><p className="font-medium text-red-900">数据加载失败</p><p className="mt-1 text-sm text-red-700">请检查网络后重试。</p><Button className="mt-4" size="sm" variant="secondary" onClick={onRetry}>重新加载</Button></div></div> }
export function EmptyState({ title = '暂无数据', description = '调整筛选条件后再试。' }: { title?: string; description?: string }) { return <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center"><div><Inbox className="mx-auto mb-2 size-6 text-slate-400" /><p className="font-medium text-slate-800">{title}</p><p className="mt-1 text-sm text-slate-500">{description}</p></div></div> }
export function StatusBadge({ active, activeText = '正常', inactiveText = '停用' }: { active: boolean; activeText?: string; inactiveText?: string }) { return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{active ? activeText : inactiveText}</span> }
export function messageOf(error: unknown) { return error instanceof Error ? error.message : '操作失败，请稍后重试。' }
export function formatDate(value?: string | null) { if (!value) return '—'; const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date) }
