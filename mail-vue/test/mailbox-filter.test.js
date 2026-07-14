import { describe, expect, it } from 'vitest'
import { ALL_MAILBOXES_ID, resolveMailboxFilter } from '../src/utils/mailbox-filter.js'

describe('inbox mailbox filter', () => {
  it('uses all mailboxes by default', () => {
    expect(resolveMailboxFilter(ALL_MAILBOXES_ID)).toBe(0)
    expect(resolveMailboxFilter(undefined)).toBe(0)
  })

	it('filters a selected mailbox by its account id', () => {
    expect(resolveMailboxFilter('7')).toBe(7)
  })
})
