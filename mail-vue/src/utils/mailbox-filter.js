export const ALL_MAILBOXES_ID = 0

export function resolveMailboxFilter(accountId) {
  const normalizedId = Number(accountId)
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    return { accountId: ALL_MAILBOXES_ID, allReceive: 1 }
  }
  return { accountId: normalizedId, allReceive: 0 }
}
