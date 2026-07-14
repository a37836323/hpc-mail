import { describe, expect, it, vi } from 'vitest'
import { consumeOAuthState, OAUTH_STATE_TTL_MS, storeOAuthState, validateOAuthAuthorizationUrl } from '../src/utils/oauth-state.js'

function memoryStorage(value) {
  let stored = value
  return {
    getItem: vi.fn(() => stored),
    setItem: vi.fn((_key, next) => { stored = next }),
    removeItem: vi.fn(() => { stored = null }),
  }
}

describe('OAuth state', () => {
  it('accepts only the backend LinuxDo authorization URL and stores its exact state', () => {
    const state = 'a'.repeat(64)
    const start = validateOAuthAuthorizationUrl(`https://connect.linux.do/oauth2/authorize?client_id=client&state=${state}`)
    const storage = memoryStorage(null)
    expect(start.state).toBe(state)
    expect(storeOAuthState(start.state, storage, 1000)).toBe(state)
    expect(storage.setItem).toHaveBeenCalledWith('hpc-mail:oauth-state', JSON.stringify({ state, createdAt: 1000 }))
  })

  it('rejects non-HTTPS, off-origin and state-less authorization URLs', () => {
    expect(() => validateOAuthAuthorizationUrl(`http://connect.linux.do/oauth2/authorize?state=${'a'.repeat(64)}`)).toThrow()
    expect(() => validateOAuthAuthorizationUrl(`https://evil.test/oauth2/authorize?state=${'a'.repeat(64)}`)).toThrow()
    expect(() => validateOAuthAuthorizationUrl('https://connect.linux.do/oauth2/authorize')).toThrow()
  })

  it('accepts one matching, fresh state and removes it', () => {
    const storage = memoryStorage(JSON.stringify({ state: 'a'.repeat(64), createdAt: 1000 }))
    expect(consumeOAuthState('a'.repeat(64), storage, 2000)).toBe(true)
    expect(storage.removeItem).toHaveBeenCalledOnce()
  })

  it('rejects missing, mismatched and stale state while removing the pending value', () => {
    const missing = memoryStorage(null)
    expect(consumeOAuthState('', missing, 2000)).toBe(false)
    expect(missing.removeItem).toHaveBeenCalledOnce()

    const mismatch = memoryStorage(JSON.stringify({ state: 'a'.repeat(64), createdAt: 1000 }))
    expect(consumeOAuthState('b'.repeat(64), mismatch, 2000)).toBe(false)

    const stale = memoryStorage(JSON.stringify({ state: 'a'.repeat(64), createdAt: 1000 }))
    expect(consumeOAuthState('a'.repeat(64), stale, 1000 + OAUTH_STATE_TTL_MS + 1)).toBe(false)
  })
})
