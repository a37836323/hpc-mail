import { api } from '@/api'
import type {
  LoginUser,
  Mailbox,
  MailListResponse,
  MailMessage,
  SendMailPayload,
  WebsiteConfig,
} from './types'

export interface MailListParams {
  accountId?: number
  emailId?: number
  timeSort?: 0 | 1
  size?: number
  type?: 0 | 1
}

export const mailApi = {
  list: (params: MailListParams, signal?: AbortSignal) =>
    api.get<MailListResponse>('/email/list', {
      query: {
        accountId: params.accountId,
        emailId: params.emailId,
        timeSort: params.timeSort,
        size: params.size,
        type: params.type,
      },
      signal,
    }),

  latest: (emailId: number, accountId = 0, signal?: AbortSignal) =>
    api.get<MailMessage[]>('/email/latest', { query: { emailId, accountId }, signal, timeoutMs: 35_000 }),

  remove: (emailIds: readonly number[]) =>
    api.delete<void>('/email/delete', { query: { emailIds: emailIds.join(',') } }),

  markRead: (emailIds: readonly number[]) =>
    api.put<void, { emailIds: readonly number[] }>('/email/read', { emailIds }),

  attachments: (emailId: number, signal?: AbortSignal) =>
    api.get<MailMessage['attList']>('/email/attList', { query: { emailId }, signal }),

  send: (payload: SendMailPayload) =>
    api.post<MailMessage[], SendMailPayload>('/email/send', payload, { timeoutMs: 60_000 }),

  addStar: (emailId: number) => api.post<void, { emailId: number }>('/star/add', { emailId }),
  cancelStar: (emailId: number) => api.delete<void>('/star/cancel', { query: { emailId } }),
  stars: (emailId = 0, size = 30, signal?: AbortSignal) =>
    api.get<Pick<MailListResponse, 'list'>>('/star/list', { query: { emailId, size }, signal }),

  mailboxes: (accountId = 0, size = 30, lastSort?: number, signal?: AbortSignal) =>
    api.get<Mailbox[]>('/account/list', { query: { accountId, size, lastSort }, signal }),

  websiteConfig: (signal?: AbortSignal) =>
    api.get<WebsiteConfig>('/setting/websiteConfig', { signal }),

  currentUser: (signal?: AbortSignal) => api.get<LoginUser>('/my/loginUserInfo', { signal }),
}
