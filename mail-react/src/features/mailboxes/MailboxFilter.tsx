import { Mail } from 'lucide-react'
import type { Mailbox } from '@/features/mail/types'

export interface MailboxFilterProps {
  mailboxes: Mailbox[]
  value: number
  loading?: boolean
  onChange: (accountId: number) => void
}

export function MailboxFilter({ mailboxes, value, loading, onChange }: MailboxFilterProps) {
  return (
    <label className="grid min-h-11 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-slate-600 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20" htmlFor="mailbox-filter">
      <Mail className="size-4.5" aria-hidden="true" />
      <span className="text-xs font-medium">邮箱筛选</span>
      <select
        id="mailbox-filter"
        className="h-10 min-w-0 border-0 bg-transparent text-sm text-slate-900 outline-none disabled:cursor-wait disabled:opacity-60"
        value={value}
        disabled={loading}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        <option value={0}>全部邮箱</option>
        {mailboxes.map((mailbox) => (
          <option key={mailbox.accountId} value={mailbox.accountId}>{mailbox.email}</option>
        ))}
      </select>
    </label>
  )
}
