export const mailKeys = {
  root: ['mail'] as const,
  list: (type: 'inbox' | 'sent', accountId: number, timeSort: 0 | 1) =>
    [...mailKeys.root, 'list', type, accountId, timeSort] as const,
  starred: () => [...mailKeys.root, 'starred'] as const,
  mailboxes: () => [...mailKeys.root, 'mailboxes'] as const,
  config: () => [...mailKeys.root, 'config'] as const,
  user: () => [...mailKeys.root, 'user'] as const,
  attachments: (emailId: number) => [...mailKeys.root, 'attachments', emailId] as const,
}
