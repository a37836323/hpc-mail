export const ALL_MAILBOXES_ID = 0

export function resolveMailboxFilter(accountId) {
  const normalizedId = Number(accountId)
  return Number.isInteger(normalizedId) && normalizedId > 0 ? normalizedId : ALL_MAILBOXES_ID
}
