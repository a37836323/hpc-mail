import { describe, expect, it } from 'vitest'
import { normalizeDomainList, resolveAuthorizedDomains } from '../src/utils/domain.js'

describe('resolveAuthorizedDomains', () => {
  it('normalizes configured domains and preserves configured order', () => {
    expect(normalizeDomainList(['@Example.COM', ' mail.example.com ', '@example.com']))
      .toEqual(['example.com', 'mail.example.com'])
  })

  it('intersects role domains case-insensitively', () => {
    expect(resolveAuthorizedDomains(['a.test', '@B.TEST'], ['@b.test', 'missing.test']))
      .toEqual(['b.test'])
  })

  it('treats an empty role list, role wildcard and admin wildcard as all configured domains', () => {
    expect(resolveAuthorizedDomains(['a.test'], [])).toEqual(['a.test'])
    expect(resolveAuthorizedDomains(['a.test'], ['*'])).toEqual(['a.test'])
    expect(resolveAuthorizedDomains(['a.test'], ['blocked.test'], true)).toEqual(['a.test'])
  })
})
