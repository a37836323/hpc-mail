import { describe, expect, it } from 'vitest'
import type { MailMessage } from './types'
import {
  authorizedDomains,
  isValidEmail,
  isValidLocalPart,
  objectUrl,
  recipientsOf,
  resolveEmailHtml,
} from './utils'

describe('mail feature utilities', () => {
  it('matches the backend dynamic sender local-part rules', () => {
    expect(isValidLocalPart('billing+asia')).toBe(true)
    expect(isValidLocalPart('.billing')).toBe(false)
    expect(isValidLocalPart('billing.')).toBe(false)
    expect(isValidLocalPart('bill..ing')).toBe(false)
    expect(isValidLocalPart('bad\nheader')).toBe(false)
  })

  it('intersects configured domains with role permissions', () => {
    expect(authorizedDomains(['@hpc.email', '@example.cn'], ['hpc.email'])).toEqual(['hpc.email'])
    expect(authorizedDomains(['@hpc.email', '@example.cn'], [])).toEqual(['hpc.email', 'example.cn'])
    expect(authorizedDomains(['@hpc.email'], ['example.cn'], true)).toEqual(['hpc.email'])
  })

  it('validates recipients and formats structured recipient data', () => {
    expect(isValidEmail('hello+tag@example.com')).toBe(true)
    expect(isValidEmail('hello..tag@example.com')).toBe(false)
    expect(isValidEmail('not-an-email')).toBe(false)

    const message = {
      recipient: JSON.stringify([{ address: 'one@example.com' }, { address: 'two@example.com' }]),
    } as MailMessage
    expect(recipientsOf(message)).toBe('one@example.com, two@example.com')
  })

  it('resolves only the configured object origin for stored HTML and attachments', () => {
    const config = { r2Domain: 'files.example.com/' }
    expect(resolveEmailHtml('<img src="{{domain}}logo.png">', config)).toContain('https://files.example.com/logo.png')
    expect(objectUrl('attachments/report.pdf', config)).toBe('https://files.example.com/attachments/report.pdf')
    expect(objectUrl('https://cdn.example.com/file.pdf', config)).toBe('https://cdn.example.com/file.pdf')
  })
})
