export const REGISTRATION_MODES = ['closed', 'invite', 'open'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export const ROLES = ['admin', 'user'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const API_SCOPES = [
  'mail.read',
  'mail.write',
  'mail.send',
  'mailbox.read',
  'mailbox.write',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const MESSAGE_DIRECTIONS = ['inbound', 'outbound'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const OUTBOUND_STATUSES = [
  'sent',
  'delivered',
  'bounced',
  'failed',
  'complained',
  'delayed',
] as const;
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number];

export const API_KEY_STATUSES = ['active', 'disabled', 'revoked'] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100;

export const MAX_RECIPIENTS = 100;
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;
export const MAX_BODY_BYTES = 1024 * 1024;

export const API_KEY_PREFIX = 'hpcm_';
export const DEFAULT_API_RATE_LIMIT = 120;

/** 用户名：小写字母/数字开头，3-32 位，允许 - _ */
export const USERNAME_REGEX = /^[a-z0-9][a-z0-9_-]{2,31}$/;

/** 邮箱前缀（local part）：1-64 位，小写字母数字开头结尾，中间允许 . _ + - */
export const LOCAL_PART_REGEX = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** 默认保留前缀：普通用户禁止认领这些「官方/系统」身份（admin 豁免） */
export const DEFAULT_RESERVED_LOCAL_PARTS = [
  'admin',
  'administrator',
  'postmaster',
  'hostmaster',
  'webmaster',
  'abuse',
  'security',
  'root',
  'noreply',
  'no-reply',
  'mailer-daemon',
  'support',
  'billing',
  'info',
  'help',
] as const;
