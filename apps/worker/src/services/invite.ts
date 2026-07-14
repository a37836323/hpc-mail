import type { CreateInviteRequest, Invite } from '@hpc-mail/shared';
import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { invites } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import type { Env } from '../types.js';

type InviteRow = typeof invites.$inferSelect;
const CODE_LENGTH = 12;
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH * 2);
  crypto.getRandomValues(bytes);
  let out = '';
  const limit = Math.floor(256 / CHARS.length) * CHARS.length;
  for (const byte of bytes) {
    if (byte >= limit) continue;
    out += CHARS[byte % CHARS.length];
    if (out.length === CODE_LENGTH) break;
  }
  return out.length === CODE_LENGTH ? out : (out + generateCode()).slice(0, CODE_LENGTH);
}

function computeStatus(row: InviteRow, now = Date.now()): Invite['status'] {
  if (row.status === 'revoked') return 'revoked';
  if (row.expiresAt && row.expiresAt.getTime() <= now) return 'expired';
  if (row.usedCount >= row.maxUses) return 'exhausted';
  return 'usable';
}

function serialize(row: InviteRow): Invite {
  return {
    id: row.id,
    code: row.code,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    status: computeStatus(row),
  };
}

export async function createInvites(
  env: Env,
  createdBy: number,
  req: CreateInviteRequest,
): Promise<Invite[]> {
  const db = createDb(env);
  const expiresAt = req.expiresAt ? new Date(req.expiresAt) : null;
  const values = Array.from({ length: req.count }, () => ({
    code: generateCode(),
    maxUses: req.maxUses,
    usedCount: 0,
    expiresAt,
    note: req.note,
    status: 'active' as const,
    createdBy,
  }));
  const rows = await db.insert(invites).values(values).returning();
  return rows.map(serialize);
}

export async function listInvites(env: Env): Promise<Invite[]> {
  const db = createDb(env);
  const rows = await db.select().from(invites).orderBy(desc(invites.id)).all();
  return rows.map(serialize);
}

export async function revokeInvite(env: Env, id: number): Promise<void> {
  const db = createDb(env);
  const row = await db.select({ id: invites.id }).from(invites).where(eq(invites.id, id)).get();
  if (!row) throw new AppError('not_found', '邀请码不存在');
  await db.update(invites).set({ status: 'revoked' }).where(eq(invites.id, id));
}

/** 原子校验并消费邀请码：单条件 UPDATE，失败即 invite_invalid，返回 invite id */
export async function consumeInvite(env: Env, code: string): Promise<number> {
  const db = createDb(env);
  const now = new Date();
  const updated = await db
    .update(invites)
    .set({ usedCount: sql`${invites.usedCount} + 1` })
    .where(
      and(
        eq(invites.code, code),
        eq(invites.status, 'active'),
        lt(invites.usedCount, invites.maxUses),
        or(isNull(invites.expiresAt), gt(invites.expiresAt, now)),
      ),
    )
    .returning({ id: invites.id })
    .get();
  if (!updated) throw new AppError('invite_invalid', '邀请码无效或已用尽');
  return updated.id;
}
