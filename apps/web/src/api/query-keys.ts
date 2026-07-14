import type { ListMessagesQuery } from '@hpc-mail/shared';

/** 集中式 query key 注册表：前缀分层，失效时按前缀 invalidate。 */
export const queryKeys = {
  config: ['config', 'public'] as const,
  session: ['session'] as const,

  mailboxes: {
    root: ['mailboxes'] as const,
    list: (scope: 'mine' | 'all') => ['mailboxes', 'list', scope] as const,
    availability: (localPart: string, domain: string) =>
      ['mailboxes', 'availability', domain, localPart] as const,
  },

  messages: {
    root: ['messages'] as const,
    list: (filters: Partial<ListMessagesQuery>) => ['messages', 'list', filters] as const,
    detail: (id: number) => ['messages', 'detail', id] as const,
  },

  apiKeys: {
    root: ['api-keys'] as const,
    list: (scope: 'mine' | 'admin') => ['api-keys', 'list', scope] as const,
  },

  admin: {
    users: ['admin', 'users'] as const,
    settings: ['admin', 'settings'] as const,
    invites: ['admin', 'invites'] as const,
  },
} as const;
