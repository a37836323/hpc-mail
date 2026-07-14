import type { MailMessage, Recipient, WebsiteConfig } from './types'

const EMAIL_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/
export const LOCAL_PART_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/

export function isValidEmail(value: string): boolean {
  const normalized = value.trim()
  return normalized.length <= 254 && !normalized.includes('..') && EMAIL_PATTERN.test(normalized)
}

export function isValidLocalPart(value: string): boolean {
  return value.length > 0 && value.length <= 64 && LOCAL_PART_PATTERN.test(value)
    && !value.startsWith('.') && !value.endsWith('.') && !value.includes('..')
}

export function normalizeDomain(value: string): string {
  return value.trim().replace(/^@+/, '').replace(/\.+$/, '').toLowerCase()
}

function normalizeList(value: string[] | string | undefined): string[] {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，;；\s]+/) : []
  return [...new Set(source.map(normalizeDomain).filter(Boolean))]
}

export function authorizedDomains(configured: string[] = [], allowed?: string[] | string, wildcard = false): string[] {
  const domains = normalizeList(configured)
  const roleDomains = normalizeList(allowed)
  if (wildcard || roleDomains.length === 0 || roleDomains.includes('*')) return domains
  const allowedSet = new Set(roleDomains)
  return domains.filter((domain) => allowedSet.has(domain))
}

export function recipientsOf(message: MailMessage): string {
  if (Array.isArray(message.recipient)) {
    return message.recipient.map((recipient) => recipient.address || recipient.name || '').filter(Boolean).join(', ')
  }
  if (typeof message.recipient === 'string' && message.recipient) {
    try {
      const parsed = JSON.parse(message.recipient) as Array<Recipient | string>
      if (Array.isArray(parsed)) {
        return parsed.map((recipient) => typeof recipient === 'string' ? recipient : recipient.address || recipient.name || '')
          .filter(Boolean).join(', ')
      }
    } catch {
      return message.recipient
    }
  }
  return Array.isArray(message.toEmail) ? message.toEmail.join(', ') : message.toEmail || '—'
}

function parseUtcDate(value: string): Date {
  if (!value) return new Date(Number.NaN)
  const normalized = /(?:z|[+-]\d\d:?\d\d)$/i.test(value) ? value : `${value.replace(' ', 'T')}Z`
  return new Date(normalized)
}

export function formatDate(value: string, detailed = false): string {
  const date = parseUtcDate(value)
  if (Number.isNaN(date.getTime())) return value || '—'
  return new Intl.DateTimeFormat('zh-CN', detailed
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function formatBytes(value = 0): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function objectUrl(key: string | undefined, config?: WebsiteConfig): string {
  if (!key) return ''
  if (/^https:\/\//i.test(key)) return key
  const domain = config?.r2Domain?.trim().replace(/\/$/, '')
  if (!domain) return key.startsWith('/') ? key : `/${key}`
  return `${/^https:\/\//i.test(domain) ? domain : `https://${domain}`}/${key.replace(/^\//, '')}`
}

export function resolveEmailHtml(content: string, config?: WebsiteConfig): string {
  const base = config?.r2Domain?.trim().replace(/\/$/, '')
  if (!base) return content
  const origin = /^https:\/\//i.test(base) ? base : `https://${base}`
  return content.replace(/{{domain}}/g, `${origin}/`)
}

export function trustedImageOrigins(config?: WebsiteConfig): string[] {
  const value = config?.r2Domain?.trim()
  if (!value) return []
  try {
    return [new URL(/^https:\/\//i.test(value) ? value : `https://${value}`).origin]
  } catch {
    return []
  }
}

export function readableError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
