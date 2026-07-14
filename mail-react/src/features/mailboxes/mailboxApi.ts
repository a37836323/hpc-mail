import { api } from '@/api'
import type { CreatedMailbox, MailboxRecord, MailboxUser, MailboxWebsiteConfig } from './mailboxTypes'

export const mailboxApi = {
  list: (accountId = 0, size = 30, lastSort?: number, signal?: AbortSignal) =>
    api.get<MailboxRecord[]>('/account/list', { query: { accountId, size, lastSort }, signal }),
  create: (email: string, token = '') =>
    api.post<CreatedMailbox, { email: string; token: string }>('/account/add', { email, token }),
  rename: (accountId: number, name: string) =>
    api.put<void, { accountId: number; name: string }>('/account/setName', { accountId, name }),
  pin: (accountId: number) =>
    api.put<void, { accountId: number }>('/account/setAsTop', { accountId }),
  remove: (accountId: number) => api.delete<void>('/account/delete', { query: { accountId } }),
  config: (signal?: AbortSignal) => api.get<MailboxWebsiteConfig>('/setting/websiteConfig', { signal }),
  currentUser: (signal?: AbortSignal) => api.get<MailboxUser>('/my/loginUserInfo', { signal }),
}

export async function loadAllMailboxes(signal?: AbortSignal): Promise<MailboxRecord[]> {
  const result: MailboxRecord[] = []
  let accountId = 0
  let lastSort: number | undefined
  for (let page = 0; page < 100; page += 1) {
    const list = await mailboxApi.list(accountId, 30, lastSort, signal)
    result.push(...list)
    if (list.length < 30) break
    const last = list.at(-1)
    if (!last || (last.accountId === accountId && last.sort === lastSort)) break
    accountId = last.accountId
    lastSort = last.sort
  }
  return result
}
