import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/axios/index.js', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}))

import http from '@/axios/index.js'
import { login } from '../src/request/login.js'
import { allEmailList } from '../src/request/all-email.js'
import { emailLatest, emailList } from '../src/request/email.js'

describe('login request', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends a username and password without an email identity field', () => {
    login('mail_admin', 'secret')
    expect(http.post).toHaveBeenCalledWith('/login', {
      username: 'mail_admin',
      password: 'secret',
    }, { noMsg: true })
    expect(http.post.mock.calls[0][1]).not.toHaveProperty('email')
  })
})

describe('mail list requests', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses accountId alone for mailbox scope', () => {
    emailList(0, 12, 0, 50, 0)
    expect(http.get).toHaveBeenCalledWith('/email/list', {
      params: { accountId: 0, emailId: 12, timeSort: 0, size: 50, type: 0 },
    })
    expect(http.get.mock.calls[0][1].params).not.toHaveProperty('allReceive')

    emailLatest(12, 7)
    expect(http.get).toHaveBeenLastCalledWith('/email/latest', {
      params: { emailId: 12, accountId: 7 },
      noMsg: true,
      timeout: 35 * 1000,
    })
  })

  it('uses username for the administrator mail search', () => {
    allEmailList({ username: 'mail_admin', type: 'receive' })
    expect(http.get).toHaveBeenCalledWith('/allEmail/list', {
      params: { username: 'mail_admin', type: 'receive' },
    })
    expect(http.get.mock.calls[0][1].params).not.toHaveProperty('userEmail')
  })
})
