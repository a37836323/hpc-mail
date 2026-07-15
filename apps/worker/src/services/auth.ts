import type {
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  SessionUser,
} from '@hpc-mail/shared';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { sha256Hex } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { signToken } from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import type { AuthUser, Env } from '../types.js';
import { avatarUrl } from './avatar.js';
import { consumeInvite } from './invite.js';
import { getInstanceEpoch, getUserEpoch, bumpUserEpoch, createSession, destroySession } from './session.js';
import { getSettings } from './setting.js';

const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 5;
const REGISTER_WINDOW_SECONDS = 60 * 60;
const MAX_REGISTER_PER_WINDOW = 10;

interface FailureRecord {
  count: number;
  blockedUntil: number;
}

async function loginKeys(username: string, ip: string): Promise<string[]> {
  const [idHash, ipHash] = await Promise.all([
    sha256Hex(`id:${username.toLowerCase()}`),
    sha256Hex(`ip:${ip.toLowerCase()}`),
  ]);
  return [`login-fail:id:${idHash}`, `login-fail:ip:${ipHash}`];
}

async function assertLoginAllowed(env: Env, username: string, ip: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const keys = await loginKeys(username, ip);
  const records = await Promise.all(keys.map((k) => env.kv.get<FailureRecord>(k, { type: 'json' })));
  if (records.some((r) => r && r.blockedUntil > now)) {
    throw new AppError('rate_limited', '登录尝试过于频繁，请稍后再试');
  }
}

async function recordLoginFailure(env: Env, username: string, ip: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const keys = await loginKeys(username, ip);
  await Promise.all(
    keys.map(async (key) => {
      const record = (await env.kv.get<FailureRecord>(key, { type: 'json' })) ?? {
        count: 0,
        blockedUntil: 0,
      };
      record.count += 1;
      if (record.count >= MAX_FAILURES) {
        record.blockedUntil = now + LOGIN_WINDOW_SECONDS;
      }
      await env.kv.put(key, JSON.stringify(record), { expirationTtl: LOGIN_WINDOW_SECONDS });
    }),
  );
}

async function resetLoginFailures(env: Env, username: string, ip: string): Promise<void> {
  const keys = await loginKeys(username, ip);
  await Promise.all(keys.map((k) => env.kv.delete(k)));
}

/** 注册按 IP 限流：每 IP 每小时上限（含失败尝试），堵开放模式灌号与邀请码暴力猜测 */
async function assertRegisterAllowed(env: Env, ip: string): Promise<void> {
  const key = `register:ip:${await sha256Hex(ip.toLowerCase())}`;
  const rec = await env.kv.get<{ count: number }>(key, { type: 'json' });
  if (rec && rec.count >= MAX_REGISTER_PER_WINDOW) {
    throw new AppError('rate_limited', '注册尝试过于频繁，请稍后再试');
  }
}

async function recordRegisterAttempt(env: Env, ip: string): Promise<void> {
  const key = `register:ip:${await sha256Hex(ip.toLowerCase())}`;
  const rec = (await env.kv.get<{ count: number }>(key, { type: 'json' })) ?? { count: 0 };
  rec.count += 1;
  await env.kv.put(key, JSON.stringify(rec), { expirationTtl: REGISTER_WINDOW_SECONDS });
}

function toSessionUser(row: typeof users.$inferSelect): SessionUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    avatarUrl: avatarUrl(row.id, row.avatarKey),
  };
}

async function issueToken(env: Env, userId: number): Promise<string> {
  const [sid, epoch, uepoch] = await Promise.all([
    createSession(env, userId),
    getInstanceEpoch(env),
    getUserEpoch(env, userId),
  ]);
  return signToken(env.jwt_secret, { sub: userId, sid, epoch, uepoch });
}

export async function login(env: Env, req: LoginRequest, ip: string): Promise<LoginResponse> {
  await assertLoginAllowed(env, req.username, ip);
  const db = createDb(env);
  const user = await db.select().from(users).where(eq(users.username, req.username)).get();
  const valid = user ? await verifyPassword(req.password, user.passwordHash) : false;
  if (!user || !valid) {
    await recordLoginFailure(env, req.username, ip);
    throw new AppError('bad_credentials', '用户名或密码错误');
  }
  if (user.status !== 'active') throw new AppError('user_disabled', '账号已被禁用');

  await resetLoginFailures(env, req.username, ip);
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), lastLoginIp: ip })
    .where(eq(users.id, user.id));

  const token = await issueToken(env, user.id);
  return { token, user: toSessionUser(user) };
}

export async function register(env: Env, req: RegisterRequest, ip: string): Promise<LoginResponse> {
  await assertRegisterAllowed(env, ip);
  await recordRegisterAttempt(env, ip);
  const settings = await getSettings(env);
  const mode = settings.register_mode;
  if (mode === 'closed') throw new AppError('registration_closed', '注册已关闭');

  let inviteId: number | null = null;
  if (mode === 'invite') {
    if (!req.inviteCode) throw new AppError('invite_invalid', '需要邀请码');
    inviteId = await consumeInvite(env, req.inviteCode);
  }

  const db = createDb(env);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, req.username)).get();
  if (existing) throw new AppError('conflict', '用户名已存在');

  const passwordHash = await hashPassword(req.password);
  const [row] = await db
    .insert(users)
    .values({
      username: req.username,
      passwordHash,
      role: 'user',
      status: 'active',
      inviteId,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    })
    .returning();
  const token = await issueToken(env, row!.id);
  return { token, user: toSessionUser(row!) };
}

export async function changePassword(
  env: Env,
  user: AuthUser,
  req: ChangePasswordRequest,
): Promise<LoginResponse> {
  const db = createDb(env);
  const row = await db.select().from(users).where(eq(users.id, user.id)).get();
  if (!row) throw new AppError('not_found', '用户不存在');
  if (!(await verifyPassword(req.oldPassword, row.passwordHash))) {
    throw new AppError('bad_credentials', '原密码错误');
  }
  const passwordHash = await hashPassword(req.newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  await bumpUserEpoch(env, user.id);
  // 旧会话全部失效，签发新 token 保持当前会话
  const token = await issueToken(env, user.id);
  return { token, user: toSessionUser(row) };
}

export async function logout(env: Env, sid: string): Promise<void> {
  await destroySession(env, sid);
}
