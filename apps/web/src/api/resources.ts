import type {
  AdminUser,
  ApiKeySummary,
  ChangePasswordRequest,
  ClaimMailboxRequest,
  CreateApiKeyRequest,
  CreatedApiKey,
  CreateInviteRequest,
  CreateUserRequest,
  Invite,
  ListMessagesQuery,
  LoginRequest,
  LoginResponse,
  Mailbox,
  MailboxAvailability,
  MessageDetail,
  MessageSummary,
  Page,
  PublicConfig,
  RegisterRequest,
  SendMailRequest,
  SessionUser,
  Settings,
  UpdateApiKeyRequest,
  UpdateMailboxRequest,
  UpdateSettingsRequest,
  UpdateUserRequest,
} from '@hpc-mail/shared';
import { api, type QueryParams } from './client';

// ---- auth ----
export const authApi = {
  login: (body: LoginRequest) => api.post<LoginResponse, LoginRequest>('/auth/login', body, { token: null }),
  register: (body: RegisterRequest) =>
    api.post<LoginResponse, RegisterRequest>('/auth/register', body, { token: null }),
  logout: () => api.post<void>('/auth/logout'),
  me: () => api.get<SessionUser>('/auth/me'),
  changePassword: (body: ChangePasswordRequest) =>
    api.put<LoginResponse, ChangePasswordRequest>('/auth/password', body),
};

// ---- 公开配置 ----
export const configApi = {
  getPublic: () => api.get<PublicConfig>('/config', { token: null }),
};

// ---- 邮箱 ----
export const mailboxApi = {
  list: (all = false) => api.get<Mailbox[]>('/mailboxes', { query: { all: all ? 1 : undefined } }),
  claim: (body: ClaimMailboxRequest) => api.post<Mailbox, ClaimMailboxRequest>('/mailboxes', body),
  update: (id: number, body: UpdateMailboxRequest) =>
    api.put<Mailbox, UpdateMailboxRequest>(`/mailboxes/${id}`, body),
  release: (id: number) => api.delete<void>(`/mailboxes/${id}`),
  availability: (localPart: string, domain: string) =>
    api.get<MailboxAvailability>('/mailboxes/availability', { query: { localPart, domain } }),
};

// ---- 邮件 ----
export const messageApi = {
  list: (query: Partial<ListMessagesQuery>) =>
    api.get<Page<MessageSummary>>('/messages', { query: query as unknown as QueryParams }),
  detail: (id: number) => api.get<MessageDetail>(`/messages/${id}`),
  send: (body: SendMailRequest) => api.post<MessageSummary, SendMailRequest>('/messages/send', body),
  markRead: (ids: number[], isRead: boolean) =>
    api.post<void, { ids: number[]; isRead: boolean }>('/messages/read', { ids, isRead }),
  remove: (ids: number[]) => api.post<void, { ids: number[] }>('/messages/delete', { ids }),
};

// ---- API Keys（自助） ----
export const apiKeyApi = {
  list: () => api.get<ApiKeySummary[]>('/api-keys'),
  create: (body: CreateApiKeyRequest) => api.post<CreatedApiKey, CreateApiKeyRequest>('/api-keys', body),
  update: (id: number, body: UpdateApiKeyRequest) =>
    api.put<ApiKeySummary, UpdateApiKeyRequest>(`/api-keys/${id}`, body),
  remove: (id: number) => api.delete<void>(`/api-keys/${id}`),
  listAll: () => api.get<ApiKeySummary[]>('/admin/api-keys'),
};

// ---- 管理端 ----
export const adminApi = {
  listUsers: () => api.get<AdminUser[]>('/admin/users'),
  createUser: (body: CreateUserRequest) => api.post<AdminUser, CreateUserRequest>('/admin/users', body),
  updateUser: (id: number, body: UpdateUserRequest) =>
    api.put<AdminUser, UpdateUserRequest>(`/admin/users/${id}`, body),
  deleteUser: (id: number) => api.delete<void>(`/admin/users/${id}`),
  getSettings: () => api.get<Settings>('/admin/settings'),
  updateSettings: (body: UpdateSettingsRequest) =>
    api.put<Settings, UpdateSettingsRequest>('/admin/settings', body),
  testFeishu: () => api.post<{ ok: boolean }>('/admin/settings/feishu-test'),
  listInvites: () => api.get<Invite[]>('/admin/invites'),
  createInvites: (body: CreateInviteRequest) => api.post<Invite[], CreateInviteRequest>('/admin/invites', body),
  revokeInvite: (id: number) => api.delete<void>(`/admin/invites/${id}`),
};
