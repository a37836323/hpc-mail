export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/

export function isValidUsername(value) {
  const username = String(value || '').trim()
  return USERNAME_PATTERN.test(username)
    && !username.startsWith('.')
    && !username.endsWith('.')
    && !username.includes('..')
}
