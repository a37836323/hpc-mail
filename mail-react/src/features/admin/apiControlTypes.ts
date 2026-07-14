export type ApiScope = 'mail.read' | 'mail.send' | 'mailbox.read'
export type ApiKeyStatus = -1 | 0 | 1

export interface ApiConfig {
  enabled: boolean
  updatedBy: number | null
  updatedTime: string | null
  totalKeys: number
  activeKeys: number
  calls24h: number
  errors24h: number
}

export interface ApiUserOption {
  userId: number
  username: string
  displayName: string
}

export interface ApiKeyRecord {
  apiKeyId: number
  name: string
  keyHint: string
  userId: number
  username: string
  displayName: string
  scopes: ApiScope[]
  allowedIps: string[]
  rateLimit: number
  status: ApiKeyStatus
  expiresAt: string | null
  lastUsedAt: string | null
  lastUsedIp: string | null
  createdBy: number
  creatorName: string
  createTime: string
}

export interface ApiKeyListResponse {
  list: ApiKeyRecord[]
  total: number
  page: number
  size: number
}

export interface ApiKeyCreateInput {
  name: string
  userId: number
  scopes: ApiScope[]
  allowedIps: string[]
  rateLimit: number
  expiresAt: string | null
}

export interface CreatedApiKey extends ApiKeyRecord {
  secret: string
}

export interface ApiAuditRecord {
  logId: number
  apiKeyId: number
  keyName: string
  requestId: string
  method: string
  path: string
  statusCode: number
  ip: string
  durationMs: number
  createTime: string
}

export interface ApiAuditResponse {
  list: ApiAuditRecord[]
  total: number
  page: number
  size: number
}

export interface PublicMailbox {
  id: number
  address: string
  name: string
  createdAt: string
}

export interface PublicMessage {
  id: number
  direction: 'received' | 'sent'
  mailboxId: number | null
  from: { address: string; name: string }
  to: Array<{ address: string; name: string }>
  subject: string
  text: string
  html: string
  verificationCode: string | null
  status: string
  read: boolean
  messageId: string | null
  inReplyTo: string | null
  createdAt: string
  attachments: Array<{
    id: number
    filename: string
    contentType: string
    size: number
    downloadUrl: string | null
  }>
}

export interface PublicApiEnvelope<T> {
  data: T
  requestId?: string
}

export interface PublicApiResult<T = unknown> {
  ok: boolean
  status: number | 'timeout' | 'network-error'
  method: string
  path: string
  durationMs: number
  requestId: string
  rateLimit: string
  rateRemaining: string
  rateReset: string
  body: string
  data?: T
}
