import type { AdminUser, CreateUserRequest, UpdateUserRequest } from '@hpc-mail/shared';
import { desc, eq, sql } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { mailboxes, users } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { hashPassword } from '../lib/password.js';
import type { Env } from '../types.js';
import { bumpUserEpoch } from './session.js';

type UserRow = typeof users.$inferSelect;

const mailboxCountSql = sql<number>`(SELECT COUNT(*) FROM mailboxes WHERE mailboxes.user_id = users.id)`;

function serialize(row: UserRow, mailboxCount: number): AdminUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
    mailboxCount,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
  };
}

export async function listUsers(env: Env): Promise<AdminUser[]> {
  const db = createDb(env);
  const rows = await db
    .select({ user: users, mailboxCount: mailboxCountSql })
    .from(users)
    .orderBy(desc(users.id))
    .all();
  return rows.map((r) => serialize(r.user, Number(r.mailboxCount)));
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
  return serialize(row!, 0);
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
    patch.status = req.status;
    if (req.status === 'disabled') bumpEpoch = true;
  }
  if (req.role !== undefined) patch.role = req.role;
  if (req.password !== undefined) {
    patch.passwordHash = await hashPassword(req.password);
    bumpEpoch = true;
  }

  const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  if (bumpEpoch) await bumpUserEpoch(env, id);

  const count = await db
    .select({ c: mailboxCountSql })
    .from(users)
    .where(eq(users.id, id))
    .get();
  return serialize(row!, Number(count?.c ?? 0));
}

/** 删除用户：级联释放 mailboxes（直接删行，messages 不动） */
export async function deleteUser(env: Env, actingUserId: number, id: number): Promise<void> {
  if (id === actingUserId) throw new AppError('forbidden', '不能删除自己');
  const db = createDb(env);
  const target = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).get();
  if (!target) throw new AppError('not_found', '用户不存在');
  await db.delete(mailboxes).where(eq(mailboxes.userId, id));
  await db.delete(users).where(eq(users.id, id));
  await bumpUserEpoch(env, id);
}
