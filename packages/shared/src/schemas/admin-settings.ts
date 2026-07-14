import { z } from 'zod';
import { REGISTRATION_MODES } from '../constants.js';
import { emailAddressSchema } from './mail.js';

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

export const SETTING_SCHEMAS = {
  register_mode: registerModeSchema,
  gmail_forward: gmailForwardSettingSchema,
  feishu: feishuSettingSchema,
  code_extract: codeExtractSettingSchema,
  resend: resendSettingSchema,
  site: siteSettingSchema,
  api: apiSettingSchema,
} as const;
export type SettingKey = keyof typeof SETTING_SCHEMAS;

export type Settings = {
  [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]>;
};

export const DEFAULT_SETTINGS: Settings = {
  register_mode: 'closed',
  gmail_forward: { enabled: false, addresses: [] },
  feishu: { enabled: false, webhookUrl: '', secret: '' },
  code_extract: { enabled: true, aiEnabled: true },
  resend: { tokens: {} },
  site: { title: 'HPC Mail' },
  api: { enabled: true },
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
