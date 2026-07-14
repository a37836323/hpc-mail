import { describe, expect, it } from 'vitest'
import { selectLongestDisplayText } from '../src/utils/text.js'

describe('selectLongestDisplayText', () => {
  it('selects the longest username returned by registration history', () => {
    const rows = [
      { username: 'lee' },
      { username: 'mail_operator' },
      { username: 'admin' },
    ]
    expect(selectLongestDisplayText(rows, 'username')).toBe('mail_operator')
  })

  it('handles missing and empty values without reading length from undefined', () => {
    expect(selectLongestDisplayText([], 'username')).toBe('')
    expect(selectLongestDisplayText([{ username: null }, {}], 'username')).toBe('')
  })

  it('prefers uppercase-heavy text when lengths are equal', () => {
    expect(selectLongestDisplayText([{ username: 'abcdef' }, { username: 'ABCdef' }], 'username'))
      .toBe('ABCdef')
  })
})
