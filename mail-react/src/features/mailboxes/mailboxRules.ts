import type { MailboxUser, MailboxWebsiteConfig } from './mailboxTypes'

export const MAILBOX_LOCAL_PART_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/

export function normalizeMailboxDomain(value: string): string {
  return String(value || '').trim().replace(/^@+/, '').replace(/\.+$/, '').toLowerCase()
}

function normalizeDomainList(value: string[] | string | undefined): string[] {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，;；\s]+/) : []
  return [...new Set(source.map(normalizeMailboxDomain).filter(Boolean))]
}

export function mailboxDomains(config: MailboxWebsiteConfig | undefined, user: MailboxUser | undefined): string[] {
  const configured = normalizeDomainList(config?.domainList)
  const allowed = normalizeDomainList(user?.role?.availDomain)
  if (user?.permKeys?.includes('*') || !allowed.length || allowed.includes('*')) return configured
  const allowedSet = new Set(allowed)
  return configured.filter((domain) => allowedSet.has(domain))
}

export function mailboxCreationEnabled(config: MailboxWebsiteConfig | undefined): boolean {
  return config?.addEmail === 0 && config?.manyEmail === 0
}

export function mailboxNeedsVerification(config: MailboxWebsiteConfig | undefined): boolean {
  return config?.addEmailVerify === 0 || (config?.addEmailVerify === 2 && config.addVerifyOpen === true)
}

export function validateMailboxLocalPart(value: string, minimum = 1): string {
  const localPart = value.trim()
  if (!localPart) return '请输入邮箱前缀。'
  if (localPart.length < Math.max(1, minimum)) return `邮箱前缀至少需要 ${Math.max(1, minimum)} 个字符。`
  if (localPart.length > 64 || !MAILBOX_LOCAL_PART_PATTERN.test(localPart)
    || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return '邮箱前缀格式无效，不能以点开头或结尾，也不能包含连续的点。'
  }
  return ''
}
