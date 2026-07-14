import { describe, expect, it } from 'vitest'
import {
  mailboxCreationEnabled,
  mailboxDomains,
  mailboxNeedsVerification,
  validateMailboxLocalPart,
} from './mailboxRules'

describe('mailbox management rules', () => {
  it('requires both add-email and multi-email switches to be open', () => {
    expect(mailboxCreationEnabled({ addEmail: 0, manyEmail: 0 })).toBe(true)
    expect(mailboxCreationEnabled({ addEmail: 1, manyEmail: 0 })).toBe(false)
    expect(mailboxCreationEnabled({ addEmail: 0, manyEmail: 1 })).toBe(false)
  })

  it('matches the Turnstile modes used by the worker', () => {
    expect(mailboxNeedsVerification({ addEmailVerify: 0 })).toBe(true)
    expect(mailboxNeedsVerification({ addEmailVerify: 1 })).toBe(false)
    expect(mailboxNeedsVerification({ addEmailVerify: 2, addVerifyOpen: false })).toBe(false)
    expect(mailboxNeedsVerification({ addEmailVerify: 2, addVerifyOpen: true })).toBe(true)
  })

  it('intersects configured domains with the platform account role', () => {
    const config = { domainList: ['@hpc.email', '@example.cn'] }
    expect(mailboxDomains(config, { userId: 1, username: 'user', role: { availDomain: ['hpc.email'] } })).toEqual(['hpc.email'])
    expect(mailboxDomains(config, { userId: 1, username: 'admin', permKeys: ['*'], role: { availDomain: [] } })).toEqual(['hpc.email', 'example.cn'])
  })

  it('enforces minimum length and backend-compatible local-part syntax', () => {
    expect(validateMailboxLocalPart('support', 3)).toBe('')
    expect(validateMailboxLocalPart('ab', 3)).toContain('至少需要 3')
    expect(validateMailboxLocalPart('.support', 1)).toContain('格式无效')
    expect(validateMailboxLocalPart('sup..port', 1)).toContain('格式无效')
  })
})
