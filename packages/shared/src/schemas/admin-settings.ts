import { z } from 'zod';
import { DEFAULT_RESERVED_LOCAL_PARTS, REGISTRATION_MODES } from '../constants.js';
import { emailAddressSchema } from './mail.js';
import { domainSchema } from './mailbox.js';

/** 掩码占位：设置回显时密文一律显示为该值；提交时值等于它则不更新 */
export const SECRET_MASK = '******';

export const registerModeSchema = z.enum(REGISTRATION_MODES);

export const gmailForwardSettingSchema = z.object({
  enabled: z.boolean(),
  /** 目标必须是 Cloudflare Email Routing 已验证的 destination address */
  addresses: z.array(emailAddressSchema).max(5),
});

export const feishuSettingSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z
    .union([z.literal(''), z.url().startsWith('https://')])
    .default(''),
  secret: z.string().max(128).default(''),
  /** 推送内容分级：仅验证码 / 摘要 / 全文原文。default 使旧配置（无此字段）仍能解析 */
  contentLevel: z.enum(['code_only', 'summary', 'full']).default('summary'),
});

export const codeExtractSettingSchema = z.object({
  enabled: z.boolean(),
  aiEnabled: z.boolean(),
});

export const resendSettingSchema = z.object({
  /** 域名 -> Resend API token */
  tokens: z.record(z.string(), z.string().max(256)),
});

export const siteSettingSchema = z.object({
  title: z.string().trim().min(1).max(64),
});

export const apiSettingSchema = z.object({
  enabled: z.boolean(),
});

/** 系统域名列表：管理端维护，空数组表示未配置任何域名（认领/发件将被拒） */
export const domainsSettingSchema = z.object({
  list: z.array(domainSchema).max(64),
});

/** 邮件保留策略：catch-all 全量落库，需定期清理防止无限膨胀撑爆 D1（0=不清理） */
export const retentionSettingSchema = z.object({
  /** 未被任何用户认领的地址收到的 inbound 邮件保留天数（这些是 catch-all 垃圾的主要来源） */
  unclaimedDays: z.number().int().min(0).max(3650),
  /** 全局所有邮件（含已认领）保留天数，作为总上限兜底；0=不限 */
  allMessagesDays: z.number().int().min(0).max(3650),
});

/** 外发配额：防被盗账号/恶意用户脚本化群发 spam 烧域名信誉（admin 豁免，0=不限） */
export const quotaSettingSchema = z.object({
  /** 普通用户每日外发邮件条数上限 */
  dailyOutbound: z.number().int().min(0).max(100000),
  /** 普通用户每日外发收件人（站外地址）总数上限 */
  dailyRecipients: z.number().int().min(0).max(1000000),
});

/** 邮箱认领策略：保留前缀防身份冒充 + 每用户认领上限防囤积（admin 豁免） */
export const mailboxPolicySettingSchema = z.object({
  /** 普通用户最多可认领地址数（0=不限） */
  perUserLimit: z.number().int().min(0).max(10000),
  /** 保留前缀：普通用户禁止认领（大小写不敏感），admin 不受限 */
  reservedLocalParts: z.array(z.string().trim().toLowerCase().max(64)).max(200),
});

export const SETTING_SCHEMAS = {
  register_mode: registerModeSchema,
  gmail_forward: gmailForwardSettingSchema,
  feishu: feishuSettingSchema,
  code_extract: codeExtractSettingSchema,
  resend: resendSettingSchema,
  site: siteSettingSchema,
  api: apiSettingSchema,
  domains: domainsSettingSchema,
  retention: retentionSettingSchema,
  quota: quotaSettingSchema,
  mailbox_policy: mailboxPolicySettingSchema,
} as const;
export type SettingKey = keyof typeof SETTING_SCHEMAS;

export type Settings = {
  [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]>;
};

export const DEFAULT_SETTINGS: Settings = {
  register_mode: 'closed',
  gmail_forward: { enabled: false, addresses: [] },
  feishu: { enabled: false, webhookUrl: '', secret: '', contentLevel: 'summary' },
  code_extract: { enabled: true, aiEnabled: true },
  resend: { tokens: {} },
  site: { title: 'HPC Mail' },
  api: { enabled: true },
  domains: { list: [] },
  // 保留策略默认关闭（0），避免升级即意外删除历史邮件；管理员按需开启（建议未认领 90 天）
  retention: { unclaimedDays: 0, allMessagesDays: 0 },
  // 外发配额默认对普通用户生效（admin 豁免），防脚本群发
  quota: { dailyOutbound: 200, dailyRecipients: 500 },
  mailbox_policy: {
    perUserLimit: 50,
    reservedLocalParts: [...DEFAULT_RESERVED_LOCAL_PARTS],
  },
};

export const updateSettingsRequestSchema = z
  .object({
    register_mode: registerModeSchema.optional(),
    gmail_forward: gmailForwardSettingSchema.optional(),
    feishu: feishuSettingSchema.optional(),
    code_extract: codeExtractSettingSchema.optional(),
    resend: resendSettingSchema.optional(),
    site: siteSettingSchema.optional(),
    api: apiSettingSchema.optional(),
    domains: domainsSettingSchema.optional(),
    retention: retentionSettingSchema.optional(),
    quota: quotaSettingSchema.optional(),
    mailbox_policy: mailboxPolicySettingSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: '至少提供一个待更新配置',
  });
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;

/** 公开配置（无鉴权 GET /api/config） */
export interface PublicConfig {
  siteTitle: string;
  registrationMode: z.infer<typeof registerModeSchema>;
  domains: string[];
}
