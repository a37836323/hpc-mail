import type { AdminUser, CreateUserRequest, UpdateUserRequest } from '@hpc-mail/shared';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { createDb, type Db } from '../db/client.js';
import { apiKeys, mailboxes, stars, users } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { hashPassword } from '../lib/password.js';
import type { Env } from '../types.js';
import { avatarUrl } from './avatar.js';
import { bumpUserEpoch } from './session.js';

type UserRow = typeof users.$inferSelect;

/** 保证不会移除最后一个可用 admin（禁用/降级/删除该 admin 前调用） */
async function assertNotLastAdmin(db: Db, targetId: number): Promise<void> {
  const other = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active'), ne(users.id, targetId)))
    .get();
  if (!other) throw new AppError('forbidden', '至少保留一个可用管理员，无法执行此操作');
}

const mailboxCountSql = sql<number>`(SELECT COUNT(*) FROM mailboxes WHERE mailboxes.user_id = users.id)`;
const apiKeyCountSql = sql<number>`(SELECT COUNT(*) FROM api_keys WHERE api_keys.user_id = users.id)`;

function serialize(row: UserRow, mailboxCount: number, apiKeyCount: number): AdminUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
    mailboxCount,
    apiKeyCount,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    avatarUrl: avatarUrl(row.id, row.avatarKey),
  };
}

export async function listUsers(env: Env): Promise<AdminUser[]> {
  const db = createDb(env);
  const rows = await db
    .select({ user: users, mailboxCount: mailboxCountSql, apiKeyCount: apiKeyCountSql })
    .from(users)
    .orderBy(desc(users.id))
    .all();
  return rows.map((r) => serialize(r.user, Number(r.mailboxCount), Number(r.apiKeyCount)));
}

export async function createUser(env: Env, req: CreateUserRequest): Promise<AdminUser> {
  const db = createDb(env);
  const existing = await db.select().from(users).where(eq(users.username, req.username)).get();
  if (existing) throw new AppError('conflict', '用户名已存在');
  const passwordHash = await hashPassword(req.password);
  const [row] = await db
    .insert(users)
    .values({ username: req.username, passwordHash, role: req.role, status: 'active' })
    .returning();
  return serialize(row!, 0, 0);
}

export async function updateUser(
  env: Env,
  actingUserId: number,
  id: number,
  req: UpdateUserRequest,
): Promise<AdminUser> {
  const db = createDb(env);
  const target = await db.select().from(users).where(eq(users.id, id)).get();
  if (!target) throw new AppError('not_found', '用户不存在');

  const patch: Partial<UserRow> = {};
  let bumpEpoch = false;

  if (req.status !== undefined) {
    if (req.status === 'disabled' && id === actingUserId) {
      throw new AppError('forbidden', '不能禁用自己');
    }
    // 禁用一个 admin 前，确保还有其他可用 admin
    if (req.status === 'disabled' && target.role === 'admin') {
      await assertNotLastAdmin(db, id);
    }
    patch.status = req.status;
    if (req.status === 'disabled') bumpEpoch = true;
  }
  // admin 降级为普通用户前，确保还有其他可用 admin（防降到 0 admin）
  if (req.role !== undefined) {
    if (req.role !== 'admin' && target.role === 'admin') {
      await assertNotLastAdmin(db, id);
    }
    patch.role = req.role;
  }
  if (req.password !== undefined) {
    patch.passwordHash = await hashPassword(req.password);
    bumpEpoch = true;
  }

  const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  if (bumpEpoch) await bumpUserEpoch(env, id);

  const count = await db
    .select({ mailboxCount: mailboxCountSql, apiKeyCount: apiKeyCountSql })
    .from(users)
    .where(eq(users.id, id))
    .get();
  return serialize(row!, Number(count?.mailboxCount ?? 0), Number(count?.apiKeyCount ?? 0));
}

/**
 * 删除用户：级联清理 mailboxes / api_keys / stars / 头像 R2 对象，避免僵尸数据。
 * messages 不动（仍按 address 归属，随地址回未认领态）。
 */
export async function deleteUser(env: Env, actingUserId: number, id: number): Promise<void> {
  if (id === actingUserId) throw new AppError('forbidden', '不能删除自己');
  const db = createDb(env);
  const target = await db
    .select({ id: users.id, role: users.role, avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, id))
    .get();
  if (!target) throw new AppError('not_found', '用户不存在');
  if (target.role === 'admin') await assertNotLastAdmin(db, id);

  await db.delete(mailboxes).where(eq(mailboxes.userId, id));
  await db.delete(apiKeys).where(eq(apiKeys.userId, id));
  await db.delete(stars).where(eq(stars.userId, id));
  await db.delete(users).where(eq(users.id, id));
  if (target.avatarKey) {
    try {
      await env.r2.delete(target.avatarKey);
    } catch (e) {
      console.error('删除用户头像对象失败:', e);
    }
  }
  await bumpUserEpoch(env, id);
}
