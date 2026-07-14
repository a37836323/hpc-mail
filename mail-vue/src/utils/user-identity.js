function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveUsername(user) {
  return clean(user?.username)
}

export function resolveDisplayName(user) {
  return clean(user?.displayName)
}

export function resolveUserDatabaseName(user) {
  const userId = Number(user?.userId)
  if (Number.isSafeInteger(userId) && userId > 0) return `hpc-mail-user-${userId}`

  const username = resolveUsername(user).toLowerCase()
  if (username) return `hpc-mail-username-${encodeURIComponent(username)}`

  return 'hpc-mail-guest'
}
