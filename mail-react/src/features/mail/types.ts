export interface Attachment {
  attId?: number
  emailId?: number
  key?: string
  filename: string
  mimeType?: string
  type?: string
  size: number
  content?: string
}

export interface Recipient {
  address?: string
  name?: string
}

export interface MailMessage {
  emailId: number
  accountId: number
  sendEmail: string
  name?: string
  subject?: string
  text?: string
  content?: string
  recipient?: string | Recipient[]
  toEmail?: string | string[]
  createTime: string
  unread: number
  isStar: number
  status?: number
  message?: string
  type?: number
  attList?: Attachment[]
}

export interface MailListResponse {
  list: MailMessage[]
  total?: number
  latestEmail?: Pick<MailMessage, 'emailId' | 'accountId'>
}

export interface Mailbox {
  accountId: number
  email: string
  name: string
  sort: number
  status?: number
  latestEmailTime?: string | null
}

export interface WebsiteConfig {
  autoRefresh?: number
  domainList?: string[]
  r2Domain?: string
  send?: number
}

export interface LoginUser {
  userId: number
  username: string
  displayName?: string
  name?: string
  permKeys?: string[]
  role?: {
    availDomain?: string[] | string
  }
}

export interface SendAttachment {
  filename: string
  size: number
  type: string
  content: string
}

export interface SendMailPayload {
  accountId: 0
  name: string
  from: {
    name: string
    localPart: string
    domain: string
  }
  sendEmail: string
  sendType?: 'reply' | 'forward' | ''
  emailId?: number
  receiveEmail: string[]
  subject: string
  content: string
  text: string
  attachments: SendAttachment[]
}
