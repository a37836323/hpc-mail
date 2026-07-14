export interface MailboxRecord {
  accountId: number
  email: string
  name: string
  sort: number
  status?: number
  latestEmailTime?: string | null
  createTime?: string | null
}

export interface CreatedMailbox extends MailboxRecord {
  addVerifyOpen?: boolean
}

export interface MailboxWebsiteConfig {
  addEmail?: number
  manyEmail?: number
  addEmailVerify?: number
  addVerifyOpen?: boolean
  minEmailPrefix?: number
  domainList?: string[]
  siteKey?: string
}

export interface MailboxUser {
  userId: number
  username: string
  permKeys?: string[]
  role?: { availDomain?: string[] | string }
}
