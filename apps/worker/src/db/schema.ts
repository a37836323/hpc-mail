import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { MessageRecipients } from '@hpc-mail/shared';

/** 统一时间戳列：unix 毫秒，Drizzle 映射为 Date */
const createdAtColumn = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user'] })
    .notNull()
    .default('user'),
  status: text('status', { enum: ['active', 'disabled'] })
    .notNull()
    .default('active'),
  inviteId: integer('invite_id'),
  /** 头像 R2 key（null 表示无头像）；随每次上传变化，用于 URL 版本号防缓存 */
  avatarKey: text('avatar_key'),
  /** TOTP 密钥（base32，启用 2FA 后有值）；未启用为 null */
  totpSecret: text('totp_secret'),
  /** 2FA 启用时间；null 表示未启用（有 totpSecret 但未启用=登记中） */
  totpEnabledAt: integer('totp_enabled_at', { mode: 'timestamp_ms' }),
  /** 恢复码哈希列表（JSON，SHA-256）；每个用一次即移除 */
  totpRecoveryCodes: text('totp_recovery_codes', { mode: 'json' }).$type<string[]>(),
  createdAt: createdAtColumn(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
  lastLoginIp: text('last_login_ip'),
});

export const mailboxes = sqliteTable(
  'mailboxes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    address: text('address').notNull().unique(),
    domain: text('domain').notNull(),
    userId: integer('user_id').notNull(),
    displayName: text('display_name').notNull().default(''),
    createdAt: createdAtColumn(),
  },
  (t) => [index('idx_mailboxes_user').on(t.userId), index('idx_mailboxes_domain').on(t.domain)],
);

export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    direction: text('direction', { enum: ['inbound', 'outbound'] }).notNull(),
    /** 本站侧地址（inbound=收件地址；outbound=发件地址） */
    address: text('address').notNull(),
    domain: text('domain').notNull(),
    fromAddress: text('from_address').notNull().default(''),
    fromName: text('from_name').notNull().default(''),
    recipients: text('recipients', { mode: 'json' })
      .notNull()
      .$type<MessageRecipients>()
      .default(sql`'{"to":[],"cc":[],"bcc":[]}'`),
    subject: text('subject').notNull().default(''),
    /** 正文前 160 字符纯文本摘要，列表接口只读此列 */
    preview: text('preview').notNull().default(''),
    bodyText: text('body_text').notNull().default(''),
    bodyHtml: text('body_html').notNull().default(''),
    /** 正文超限时完整 JSON 落 R2 的 key */
    bodyR2Key: text('body_r2_key'),
    /** 原始 .eml 落 R2 的 key（inbound 收件时存档，供下载/排查 DKIM）；null 表示未存档 */
    rawR2Key: text('raw_r2_key'),
    /** 软删除时间；null=正常，有值=在回收站（scheduled 到期后硬删） */
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    verificationCode: text('verification_code').notNull().default(''),
    messageId: text('message_id'),
    inReplyTo: text('in_reply_to'),
    status: text('status').notNull(),
    sendChannel: text('send_channel').notNull().default(''),
    errorDetail: text('error_detail').notNull().default(''),
    isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
    size: integer('size').notNull().default(0),
    createdAt: createdAtColumn(),
  },
  (t) => [
    index('idx_messages_address').on(t.address, t.id),
    index('idx_messages_domain').on(t.domain, t.id),
    index('idx_messages_direction').on(t.direction, t.id),
    index('idx_messages_deleted').on(t.deletedAt),
  ],
);

export const attachments = sqliteTable(
  'attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: integer('message_id').notNull(),
    r2Key: text('r2_key').notNull(),
    filename: text('filename').notNull().default('download'),
    mimeType: text('mime_type').notNull().default('application/octet-stream'),
    size: integer('size').notNull().default(0),
    contentId: text('content_id').notNull().default(''),
    disposition: text('disposition').notNull().default('attachment'),
  },
  (t) => [index('idx_attachments_message').on(t.messageId)],
);

/** 星标：每用户对某封邮件的标记（messages 不含 user_id，星标独立表关联） */
export const stars = sqliteTable(
  'stars',
  {
    userId: integer('user_id').notNull(),
    messageId: integer('message_id').notNull(),
    createdAt: createdAtColumn(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.messageId] }),
    index('idx_stars_message').on(t.messageId),
  ],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const invites = sqliteTable('invites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  maxUses: integer('max_uses').notNull().default(1),
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  note: text('note').notNull().default(''),
  status: text('status', { enum: ['active', 'revoked'] })
    .notNull()
    .default('active'),
  createdBy: integer('created_by'),
  createdAt: createdAtColumn(),
});

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    keySuffix: text('key_suffix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    userId: integer('user_id').notNull(),
    scopes: text('scopes', { mode: 'json' }).notNull().$type<string[]>(),
    allowedIps: text('allowed_ips', { mode: 'json' }).notNull().$type<string[]>(),
    rateLimit: integer('rate_limit').notNull().default(120),
    status: text('status', { enum: ['active', 'disabled', 'revoked'] })
      .notNull()
      .default('active'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    lastUsedIp: text('last_used_ip'),
    createdAt: createdAtColumn(),
  },
  (t) => [index('idx_api_keys_user').on(t.userId)],
);

export const apiRequestLogs = sqliteTable(
  'api_request_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    apiKeyId: integer('api_key_id').notNull(),
    requestId: text('request_id').notNull().default(''),
    method: text('method').notNull(),
    path: text('path').notNull(),
    statusCode: integer('status_code').notNull(),
    ip: text('ip').notNull().default(''),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: createdAtColumn(),
  },
  (t) => [
    index('idx_api_logs_key').on(t.apiKeyId, t.id),
    index('idx_api_logs_created').on(t.createdAt),
  ],
);

export const apiRateLimits = sqliteTable(
  'api_rate_limits',
  {
    apiKeyId: integer('api_key_id').notNull(),
    windowStart: integer('window_start').notNull(),
    requestCount: integer('request_count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.apiKeyId, t.windowStart] })],
);

/** 管理操作审计：记录 admin 的高危动作（删户/改密/改设置/删域名/邀请/吊销 key），可追溯 */
export const adminAuditLogs = sqliteTable(
  'admin_audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actorId: integer('actor_id').notNull(),
    actorName: text('actor_name').notNull().default(''),
    /** 动作类型，如 user.delete / settings.update / invite.revoke */
    action: text('action').notNull(),
    /** 目标的可读标识，如用户名、设置键、域名 */
    target: text('target').notNull().default(''),
    /** 附加说明 */
    detail: text('detail').notNull().default(''),
    ip: text('ip').notNull().default(''),
    createdAt: createdAtColumn(),
  },
  (t) => [index('idx_admin_audit_created').on(t.createdAt)],
);
