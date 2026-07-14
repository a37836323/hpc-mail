import { describe, expect, it } from 'vitest'
import { ALL_MAILBOXES_ID, resolveMailboxFilter } from '../src/utils/mailbox-filter.js'

describe('inbox mailbox filter', () => {
  it('uses all mailboxes by default', () => {
    expect(resolveMailboxFilter(ALL_MAILBOXES_ID)).toEqual({ accountId: 0, allReceive: 1 })
    expect(resolveMailboxFilter(undefined)).toEqual({ accountId: 0, allReceive: 1 })
  })

  it('filters a selected mailbox without inheriting its catch-all setting', () => {
    expect(resolveMailboxFilter('7')).toEqual({ accountId: 7, allReceive: 0 })
  })
})
