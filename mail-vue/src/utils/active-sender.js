function hasAddress(account) {
  return Boolean(account && typeof account.email === 'string' && account.email.trim())
}

export function resolveActiveSenderAccount(currentAccount, preferredAddress = '') {
  const candidates = [currentAccount].filter(hasAddress)
  const preferred = String(preferredAddress || '').trim().toLowerCase()
  if (preferred) {
    const match = candidates.find(account => account.email.trim().toLowerCase() === preferred)
    if (match) return match
  }
  return candidates[0] || null
}
