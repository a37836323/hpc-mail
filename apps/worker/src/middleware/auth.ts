import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { createDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { verifyToken } from '../lib/jwt.js';
import {
  getInstanceEpoch,
  getUserEpoch,
  sessionExists,
} from '../services/session.js';
import type { AppContext, AuthUser } from '../types.js';

function bearer(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const header = c.req.header('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1]!.trim() : null;
}

/** JWT + KV 会话 + 用户代/实例代 + 每请求查 users 单行验状态 */
export const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const token = bearer(c);
  if (!token) throw new AppError('unauthorized', '缺少访问令牌');

  const claims = await verifyToken(c.env.jwt_secret, token);
  if (!claims) throw new AppError('unauthorized', '令牌无效或已过期');

  if (!(await sessionExists(c.env, claims.sid))) {
    throw new AppError('unauthorized', '会话已失效');
  }

  const [instanceEpoch, userEpoch] = await Promise.all([
    getInstanceEpoch(c.env),
    getUserEpoch(c.env, claims.sub),
  ]);
  if (claims.epoch !== instanceEpoch || claims.uepoch !== userEpoch) {
    throw new AppError('unauthorized', '会话已失效');
  }

  const db = createDb(c.env);
  const row = await db.select().from(users).where(eq(users.id, claims.sub)).get();
  if (!row) throw new AppError('unauthorized', '用户不存在');
  if (row.status !== 'active') throw new AppError('user_disabled', '账号已被禁用');

  const authUser: AuthUser = {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
    avatarKey: row.avatarKey,
    twoFactorEnabled: !!row.totpEnabledAt,
  };
  c.set('user', authUser);
  c.set('sessionId', claims.sid);
  await next();
};

/** 需 admin 角色（须在 requireAuth 之后） */
export const requireAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') throw new AppError('forbidden', '需要管理员权限');
  await next();
};
