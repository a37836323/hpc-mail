import { z } from 'zod';
import { LOCAL_PART_REGEX } from '../constants.js';

export const localPartSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(LOCAL_PART_REGEX, '前缀需为 1-64 位小写字母/数字，中间可含 . _ + -');

export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, '域名格式非法');

export const claimMailboxRequestSchema = z.object({
  localPart: localPartSchema,
  domain: domainSchema,
});
export type ClaimMailboxRequest = z.infer<typeof claimMailboxRequestSchema>;

export const updateMailboxRequestSchema = z.object({
  displayName: z.string().trim().max(64),
});
export type UpdateMailboxRequest = z.infer<typeof updateMailboxRequestSchema>;

export interface Mailbox {
  id: number;
  address: string;
  domain: string;
  userId: number;
  /** 仅 admin ?all=1 场景返回 */
  ownerUsername?: string;
  displayName: string;
  messageCount: number;
  createdAt: string;
}

export interface MailboxAvailability {
  address: string;
  available: boolean;
}
