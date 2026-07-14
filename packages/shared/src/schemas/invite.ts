import { z } from 'zod';

export const createInviteRequestSchema = z.object({
  /** 一次生成多少个码 */
  count: z.number().int().min(1).max(50).default(1),
  /** 每个码可用次数 */
  maxUses: z.number().int().min(1).max(1000).default(1),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  note: z.string().trim().max(128).default(''),
});
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

export interface Invite {
  id: number;
  code: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  note: string;
  createdAt: string;
  status: 'usable' | 'exhausted' | 'expired' | 'revoked';
}
