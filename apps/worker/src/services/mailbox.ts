import type { ClaimMailboxRequest, Mailbox, MailboxAvailability } from '@hpc-mail/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { mailboxes, users } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import type { Env } from '../types.js';
import { getDomains } from './domain.js';

type MailboxRow = typeof mailboxes.$inferSelect;

const messageCountSql = sql<number>`(SELECT COUNT(*) FROM messages WHERE messages.address = mailboxes.address)`;

function serialize(row: MailboxRow, messageCount: number, ownerUsername?: string): Mailbox {
  return {
    id: row.id,
    address: row.address,
    domain: row.domain,
    userId: row.userId,
    displayName: row.displayName,
    messageCount,
    createdAt: row.createdAt.toISOString(),
    ...(ownerUsername !== undefined ? { ownerUsername } : {}),
  };
}

export async function listMailboxes(
  env: Env,
  opts: { userId?: number; all?: boolean },
): Promise<Mailbox[]> {
  const db = createDb(env);
  if (opts.all) {
    const rows = await db
      .select({ mailbox: mailboxes, username: users.username, messageCount: messageCountSql })
      .from(mailboxes)
      .leftJoin(users, eq(users.id, mailboxes.userId))
      .orderBy(desc(mailboxes.id))
      .all();
    return rows.map((r) => serialize(r.mailbox, Number(r.messageCount), r.username ?? ''));
  }
  const rows = await db
    .select({ mailbox: mailboxes, messageCount: messageCountSql })
    .from(mailboxes)
    .where(eq(mailboxes.userId, opts.userId!))
    .orderBy(desc(mailboxes.id))
    .all();
  return rows.map((r) => serialize(r.mailbox, Number(r.messageCount)));
}

/** 认领地址：domain 必须 ∈ 系统域名，address 全局唯一 */
export async function claimMailbox(
  env: Env,
  userId: number,
  req: ClaimMailboxRequest,
): Promise<Mailbox> {
  const domains = await getDomains(env);
  if (!domains.includes(req.domain)) {
    throw new AppError('validation_failed', '域名不在系统域名列表内');
  }
  const address = `${req.localPart}@${req.domain}`;
  const db = createDb(env);
  const existing = await db.select().from(mailboxes).where(eq(mailboxes.address, address)).get();
  if (existing) throw new AppError('address_taken', '该地址已被占用');
  try {
    const [row] = await db
      .insert(mailboxes)
      .values({ address, domain: req.domain, userId, displayName: '' })
      .returning();
    return serialize(row!, 0);
  } catch {
    throw new AppError('address_taken', '该地址已被占用');
  }
}

export async function updateMailbox(
  env: Env,
  userId: number,
  id: number,
  displayName: string,
  isAdmin: boolean,
): Promise<Mailbox> {
  const db = createDb(env);
  const row = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).get();
  if (!row || (!isAdmin && row.userId !== userId)) throw new AppError('not_found', '邮箱不存在');
  await db.update(mailboxes).set({ displayName }).where(eq(mailboxes.id, id));
  const [updated] = await db
    .select({ mailbox: mailboxes, messageCount: messageCountSql })
    .from(mailboxes)
    .where(eq(mailboxes.id, id))
    .all();
  return serialize(updated!.mailbox, Number(updated!.messageCount));
}

/** 释放地址（历史邮件不动，随地址回到未认领态） */
export async function releaseMailbox(
  env: Env,
  userId: number,
  id: number,
  isAdmin: boolean,
): Promise<void> {
  const db = createDb(env);
  const row = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).get();
  if (!row || (!isAdmin && row.userId !== userId)) throw new AppError('not_found', '邮箱不存在');
  await db.delete(mailboxes).where(eq(mailboxes.id, id));
}

export async function checkAvailability(
  env: Env,
  localPart: string,
  domain: string,
): Promise<MailboxAvailability> {
  const address = `${localPart}@${domain}`;
  const domains = await getDomains(env);
  if (!domains.includes(domain)) return { address, available: false };
  const db = createDb(env);
  const existing = await db.select().from(mailboxes).where(eq(mailboxes.address, address)).get();
  return { address, available: !existing };
}

/** 取用户认领的全部地址（用于 messages 可见性过滤） */
export async function userAddresses(env: Env, userId: number): Promise<string[]> {
  const db = createDb(env);
  const rows = await db
    .select({ address: mailboxes.address })
    .from(mailboxes)
    .where(eq(mailboxes.userId, userId))
    .all();
  return rows.map((r) => r.address);
}

/** 校验地址归属（发件身份校验用） */
export async function userOwnsAddress(env: Env, userId: number, address: string): Promise<boolean> {
  const db = createDb(env);
  const row = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(and(eq(mailboxes.userId, userId), eq(mailboxes.address, address)))
    .get();
  return row !== undefined;
}
