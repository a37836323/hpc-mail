import { describe, expect, it } from 'vitest'
import { resolveActiveSenderAccount } from '../src/utils/active-sender.js'
import { resolveDisplayName, resolveUserDatabaseName, resolveUsername } from '../src/utils/user-identity.js'
import { isValidUsername } from '../src/utils/username.js'

describe('modern user identity', () => {
  it('accepts usernames and rejects email addresses', () => {
    expect(isValidUsername('riba2534')).toBe(true)
    expect(isValidUsername('mail_admin-01')).toBe(true)
    expect(isValidUsername('riba2534@example.com')).toBe(false)
    expect(isValidUsername('.admin')).toBe(false)
    expect(isValidUsername('admin..ops')).toBe(false)
  })

  it('never falls back to email-shaped compatibility fields', () => {
    const user = {
      email: 'old@example.com',
      legacyEmail: 'legacy@example.com',
      name: 'Old display name',
    }
    expect(resolveUsername(user)).toBe('')
    expect(resolveDisplayName(user)).toBe('')
  })

  it('names IndexedDB by user ID, then username, without using an email field', () => {
    expect(resolveUserDatabaseName({ userId: 42, username: 'Admin', email: 'old@example.com' }))
      .toBe('hpc-mail-user-42')
    expect(resolveUserDatabaseName({ username: 'Admin', email: 'old@example.com' }))
      .toBe('hpc-mail-username-admin')
    expect(resolveUserDatabaseName({ email: 'old@example.com' }))
      .toBe('hpc-mail-guest')
  })
})

describe('active sender account', () => {
  it('uses only the mailbox selected in the current workspace', () => {
    const current = { accountId: 2, email: 'current@example.com' }
    expect(resolveActiveSenderAccount(current)).toBe(current)
    expect(resolveActiveSenderAccount({})).toBeNull()
  })

  it('honors a reply address only when it matches the active mailbox', () => {
    const current = { accountId: 2, email: 'current@example.com' }
    expect(resolveActiveSenderAccount(current, 'CURRENT@example.com')).toBe(current)
    expect(resolveActiveSenderAccount(current, 'other@example.com')).toBe(current)
  })
})
