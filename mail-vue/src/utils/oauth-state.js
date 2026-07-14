const OAUTH_STATE_KEY = 'hpc-mail:oauth-state'
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

export function storeOAuthState(state, storage = globalThis.sessionStorage, now = Date.now()) {
  if (typeof state !== 'string' || state.length < 32) throw new Error('Invalid OAuth state')
  storage.setItem(OAUTH_STATE_KEY, JSON.stringify({ state, createdAt: now }))
  return state
}

export function validateOAuthAuthorizationUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.origin !== 'https://connect.linux.do' || url.pathname !== '/oauth2/authorize') {
    throw new Error('Invalid OAuth authorization URL')
  }
  const state = url.searchParams.get('state')
  if (!state || state.length < 32) throw new Error('Invalid OAuth state')
  return { authorizationUrl: url.toString(), state }
}

export function consumeOAuthState(returnedState, storage = globalThis.sessionStorage, now = Date.now()) {
  const serialized = storage.getItem(OAUTH_STATE_KEY)
  storage.removeItem(OAUTH_STATE_KEY)
  if (!returnedState || !serialized) return false
  try {
    const pending = JSON.parse(serialized)
    const age = now - Number(pending.createdAt)
    return typeof pending.state === 'string'
      && pending.state.length >= 32
      && pending.state === returnedState
      && age >= 0
      && age <= OAUTH_STATE_TTL_MS
  } catch {
    return false
  }
}
