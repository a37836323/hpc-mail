export interface AdminUser {
  userId: number
  username: string
  displayName: string
  type: number
  roleKey?: string
  roleName?: string
  status: number
  isDel: number
  createTime?: string | null
  activeTime?: string | null
  sendCount: number
  receiveEmailCount?: number
  sendEmailCount?: number
  accountCount?: number
}

export interface RoleSummary { roleId: number; name: string; isDefault: number }
export interface AdminRole extends RoleSummary {
  key: string
  description?: string | null
  banEmail: string[]
  banEmailType: number
  availDomain: string[]
  sort?: number | null
  isSystem: number
  sendCount?: number | null
  sendType?: string | null
  accountCount?: number | null
  permIds: number[]
}

export interface PermissionNode { permId: number; name: string; permKey?: string | null; children?: PermissionNode[] }

export interface AdminMail {
  emailId: number
  username?: string | null
  sendEmail?: string | null
  toEmail: string
  name?: string | null
  subject?: string | null
  text?: string | null
  type: number
  status: number
  isDel: number
  createTime: string
}

export interface InviteKey {
  regKeyId: number
  code: string
  count: number
  roleId: number
  roleName?: string
  userId: number
  expireTime: string | null
  createTime: string
}

export interface SystemSetting {
  title: string
  register: number
  loginDomain: number
  regKey: number
  addEmail: number
  manyEmail: number
  minEmailPrefix: number
  emailPrefixFilter: string[]
  receive: number
  send: number
  noRecipient: number
  autoRefresh: number
  registerVerify: number
  addEmailVerify: number
  regVerifyCount: number
  addVerifyCount: number
  siteKey?: string | null
  secretKey?: string | null
  domainList: string[]
  hasCfEmail?: boolean
  resendTokens: Record<string, string>
  r2Domain?: string | null
  storageType?: string
  hasR2?: boolean
  bucket: string
  region: string
  endpoint: string
  forcePathStyle: number
  s3AccessKey?: string | null
  s3SecretKey?: string | null
  tgBotStatus: number
  tgBotToken?: string
  tgChatId: string
  customDomain: string
  tgMsgFrom: string
  tgMsgTo: string
  tgMsgText: string
  feishuBotStatus: number
  feishuWebhookUrl?: string
  feishuBotSecret?: string
  feishuWebhookConfigured?: boolean
  feishuBotSecretConfigured?: boolean
  forwardStatus: number
  forwardEmail: string
  ruleType: number
  ruleEmail: string
  blackSubject: string
  blackContent: string
  blackFrom: string
  notice: number
  noticeTitle: string
  noticeContent: string
  noticeType: string
  noticeDuration: number
  noticePosition: string
  noticeOffset: number
  noticeWidth: number
  aiCode: number
  aiCodeFilter: string
}

export interface SystemSecretDraft {
  siteKey: string
  secretKey: string
  s3AccessKey: string
  s3SecretKey: string
  tgBotToken: string
  feishuWebhookUrl: string
  feishuBotSecret: string
  resendTokens: Record<string, string>
}
