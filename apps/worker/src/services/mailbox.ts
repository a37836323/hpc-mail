import type { ClaimMailboxRequest, Mailbox, MailboxAvailability, Role } from '@hpc-mail/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { attachments as attachmentsTable, mailboxes, messages, stars, users } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import type { Env } from '../types.js';
import { getDomains } from './domain.js';
import { getSettings } from './setting.js';
import { deleteMessageObjects } from './storage.js';

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

/** 认领地址：domain 必须 ∈ 系统域名，address 全局唯一，普通用户受保留前缀/配额限制 */
export async function claimMailbox(
  env: Env,
  userId: number,
  role: Role,
  req: ClaimMailboxRequest,
): Promise<Mailbox> {
  const settings = await getSettings(env);
  const domains = await getDomains(env, settings);
  if (!domains.includes(req.domain)) {
    throw new AppError('validation_failed', '域名不在系统域名列表内');
  }
  const db = createDb(env);

  // 普通用户：保留前缀禁止认领（防冒充官方身份）+ 每用户认领上限（防囤积）
  if (role !== 'admin') {
    const policy = settings.mailbox_policy;
    if (policy.reservedLocalParts.includes(req.localPart)) {
      throw new AppError('forbidden', `前缀 ${req.localPart} 为系统保留，无法认领`);
    }
    if (policy.perUserLimit > 0) {
      const owned = await db
        .select({ value: sql<number>`COUNT(*)` })
        .from(mailboxes)
        .where(eq(mailboxes.userId, userId))
        .get();
      if ((owned?.value ?? 0) >= policy.perUserLimit) {
        throw new AppError('forbidden', `认领地址数已达上限（${policy.perUserLimit}）`);
      }
    }
  }

  const address = `${req.localPart}@${req.domain}`;
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

/** 删除某地址名下的全部邮件（D1 行 + R2 对象）——释放地址时可选调用 */
async function purgeAddressMessages(env: Env, address: string): Promise<number> {
  const db = createDb(env);
  const targets = await db
    .select({ id: messages.id, bodyR2Key: messages.bodyR2Key })
    .from(messages)
    .where(eq(messages.address, address))
    .all();
  if (targets.length === 0) return 0;
  const ids = targets.map((t) => t.id);
  await db.delete(attachmentsTable).where(inArray(attachmentsTable.messageId, ids));
  await db.delete(stars).where(inArray(stars.messageId, ids));
  await db.delete(messages).where(inArray(messages.id, ids));
  for (const t of targets) {
    await deleteMessageObjects(env, t.id, t.bodyR2Key);
  }
  return ids.length;
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

/**
 * 释放地址。默认历史邮件不动（随地址回到未认领态，下一个认领者可见）；
 * deleteHistory=true 时同时删除该地址名下全部邮件——堵住「释放后被他人继承验证码/账单」的隐私路径。
 */
export async function releaseMailbox(
  env: Env,
  userId: number,
  id: number,
  isAdmin: boolean,
  deleteHistory = false,
): Promise<{ deletedMessages: number }> {
  const db = createDb(env);
  const row = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).get();
  if (!row || (!isAdmin && row.userId !== userId)) throw new AppError('not_found', '邮箱不存在');
  await db.delete(mailboxes).where(eq(mailboxes.id, id));
  let deletedMessages = 0;
  if (deleteHistory) {
    deletedMessages = await purgeAddressMessages(env, row.address);
  }
  return { deletedMessages };
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
