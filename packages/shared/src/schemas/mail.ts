import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_TOTAL_BYTES,
  MAX_BODY_BYTES,
  MAX_PAGE_SIZE,
  MAX_RECIPIENTS,
  MESSAGE_DIRECTIONS,
  type MessageDirection,
} from '../constants.js';
import { domainSchema, localPartSchema } from './mailbox.js';

export const emailAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, '邮箱地址格式非法');

export const listMessagesQuerySchema = z.object({
  direction: z.enum(MESSAGE_DIRECTIONS).optional(),
  domain: domainSchema.optional(),
  address: emailAddressSchema.optional(),
  unread: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
    .transform((v) => v === '1' || v === 'true')
    .optional(),
  q: z.string().trim().max(256).optional(),
  /** admin 专用：'mine' 只看自己认领地址（默认全站） */
  scope: z.enum(['mine', 'all']).optional(),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const sendAttachmentSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((v) => !/[/\\]/.test(v) && !v.includes('..'), '文件名非法'),
  contentType: z.string().trim().min(3).max(128),
  /** base64 编码内容 */
  content: z.string().min(1).regex(/^[A-Za-z0-9+/]+={0,2}$/, '附件需为合法 base64'),
});

export const sendMailRequestSchema = z
  .object({
    from: z
      .object({
        mailboxId: z.number().int().positive().optional(),
        localPart: localPartSchema.optional(),
        domain: domainSchema.optional(),
        displayName: z.string().trim().max(64).optional(),
      })
      .refine(
        (f) =>
          (f.mailboxId !== undefined && f.localPart === undefined && f.domain === undefined) ||
          (f.mailboxId === undefined && f.localPart !== undefined && f.domain !== undefined),
        'from 需为 mailboxId 或 localPart+domain 二选一',
      ),
    to: z.array(emailAddressSchema).min(1),
    cc: z.array(emailAddressSchema).default([]),
    bcc: z.array(emailAddressSchema).default([]),
    subject: z.string().trim().min(1).max(998),
    text: z.string().max(MAX_BODY_BYTES).optional(),
    html: z.string().max(MAX_BODY_BYTES).optional(),
    attachments: z.array(sendAttachmentSchema).max(MAX_ATTACHMENTS).default([]),
  })
  .refine((v) => v.to.length + v.cc.length + v.bcc.length <= MAX_RECIPIENTS, {
    message: `收件人合计不能超过 ${MAX_RECIPIENTS} 个`,
  })
  .refine((v) => (v.text ?? '').length > 0 || (v.html ?? '').length > 0, {
    message: '正文不能为空',
  })
  .refine(
    (v) =>
      v.attachments.reduce((sum, a) => sum + Math.ceil((a.content.length * 3) / 4), 0) <=
      MAX_ATTACHMENT_TOTAL_BYTES,
    { message: '附件合计超过 25MB 上限' },
  );
export type SendMailRequest = z.infer<typeof sendMailRequestSchema>;

export const markReadRequestSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  isRead: z.boolean().default(true),
});
export type MarkReadRequest = z.infer<typeof markReadRequestSchema>;

export const deleteMessagesRequestSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});
export type DeleteMessagesRequest = z.infer<typeof deleteMessagesRequestSchema>;

export interface MessageSummary {
  id: number;
  direction: MessageDirection;
  address: string;
  domain: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  preview: string;
  verificationCode: string;
  status: string;
  isRead: boolean;
  hasAttachments: boolean;
  size: number;
  createdAt: string;
}

export interface AttachmentMeta {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
  contentId: string;
  disposition: string;
  /** 短期签名下载 URL（详情接口下发） */
  url: string;
}

export interface MessageRecipients {
  to: string[];
  cc: string[];
  bcc: string[];
}

export interface MessageDetail extends MessageSummary {
  recipients: MessageRecipients;
  bodyText: string;
  bodyHtml: string;
  errorDetail: string;
  attachments: AttachmentMeta[];
}
