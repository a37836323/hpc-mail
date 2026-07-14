import { describe, expect, it } from 'vitest'
import { resolveDefaultSenderAccount } from '../src/utils/default-sender.js'
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

describe('default sender account', () => {
  it('uses only the active mailbox or the backend default mailbox', () => {
    const current = { accountId: 2, email: 'current@example.com' }
    const fallback = { accountId: 1, email: 'default@example.com' }
    expect(resolveDefaultSenderAccount(current, fallback)).toBe(current)
    expect(resolveDefaultSenderAccount({}, fallback)).toBe(fallback)
    expect(resolveDefaultSenderAccount({}, {})).toBeNull()
  })

  it('honors a reply address only when it is one of those mailbox accounts', () => {
    const current = { accountId: 2, email: 'current@example.com' }
    const fallback = { accountId: 1, email: 'default@example.com' }
    expect(resolveDefaultSenderAccount(current, fallback, 'DEFAULT@example.com')).toBe(fallback)
    expect(resolveDefaultSenderAccount(current, fallback, 'legacy@example.com')).toBe(current)
  })
})
