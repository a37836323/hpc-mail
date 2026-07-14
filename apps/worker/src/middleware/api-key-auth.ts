import { API_KEY_PREFIX, type ApiScope } from '@hpc-mail/shared';
import { eq, sql } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { createDb } from '../db/client.js';
import { apiKeys, apiRateLimits, apiRequestLogs, users } from '../db/schema.js';
import { sha256Hex } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { getSettings } from '../services/setting.js';
import type { AppContext } from '../types.js';

const KEY_PATTERN = new RegExp(`^${API_KEY_PREFIX}[a-f0-9]{64}$`);

function clientIp(c: Context<AppContext>): string {
  const value = c.req.header('CF-Connecting-IP') || '';
  return (value.split(',')[0] ?? '').trim().toLowerCase() || 'unknown';
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    num = num * 256 + n;
  }
  return num >>> 0;
}

/** 支持精确匹配与 IPv4 CIDR */
function ipInAllowList(ip: string, list: string[]): boolean {
  if (list.length === 0) return true;
  for (const entry of list) {
    const trimmed = entry.trim().toLowerCase();
    if (trimmed === ip) return true;
    const slash = trimmed.indexOf('/');
    if (slash > 0) {
      const base = trimmed.slice(0, slash);
      const bits = Number(trimmed.slice(slash + 1));
      const ipInt = ipv4ToInt(ip);
      const baseInt = ipv4ToInt(base);
      if (ipInt !== null && baseInt !== null && bits >= 0 && bits <= 32) {
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        if ((ipInt & mask) === (baseInt & mask)) return true;
      }
    }
  }
  return false;
}

/** /v1 鉴权：hash 查 key → 状态/过期/IP → 滑窗限流 → finally 审计 */
export const apiKeyAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const startedAt = Date.now();
  c.set('apiStartedAt', startedAt);

  const settings = await getSettings(c.env);
  if (!settings.api.enabled) throw new AppError('forbidden', 'API 已关闭');

  const header = c.req.header('Authorization') || '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
  if (!KEY_PATTERN.test(token)) throw new AppError('unauthorized', '缺少或非法的 API Key');

  const keyHash = await sha256Hex(token);
  const db = createDb(c.env);
  const row = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      scopes: apiKeys.scopes,
      allowedIps: apiKeys.allowedIps,
      rateLimit: apiKeys.rateLimit,
      status: apiKeys.status,
      expiresAt: apiKeys.expiresAt,
      userStatus: users.status,
      role: users.role,
    })
    .from(apiKeys)
    .leftJoin(users, eq(users.id, apiKeys.userId))
    .where(eq(apiKeys.keyHash, keyHash))
    .get();

  if (!row) throw new AppError('unauthorized', 'API Key 无效');
  if (row.status !== 'active') throw new AppError('unauthorized', 'API Key 已禁用或吊销');
  if (row.userStatus !== 'active') throw new AppError('user_disabled', 'API Key 所属用户已被禁用');
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    throw new AppError('unauthorized', 'API Key 已过期');
  }

  const ip = clientIp(c);
  if (!ipInAllowList(ip, row.allowedIps)) throw new AppError('forbidden', '来源 IP 不在白名单内');

  c.set('apiClientIp', ip);
  c.set('apiKey', {
    id: row.id,
    userId: row.userId,
    role: row.role ?? 'user',
    scopes: row.scopes as ApiScope[],
  });

  let statusCode = 200;
  try {
    const windowStart = Math.floor(Date.now() / 60000);
    const rate = await db
      .insert(apiRateLimits)
      .values({ apiKeyId: row.id, windowStart, requestCount: 1 })
      .onConflictDoUpdate({
        target: [apiRateLimits.apiKeyId, apiRateLimits.windowStart],
        set: { requestCount: sql`${apiRateLimits.requestCount} + 1` },
      })
      .returning({ requestCount: apiRateLimits.requestCount })
      .get();
    const requestCount = rate?.requestCount ?? 1;
    c.header('X-RateLimit-Limit', String(row.rateLimit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, row.rateLimit - requestCount)));
    c.header('X-RateLimit-Reset', String((windowStart + 1) * 60));
    if (requestCount > row.rateLimit) throw new AppError('rate_limited', 'API 调用频率超限');

    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date(), lastUsedIp: ip })
      .where(eq(apiKeys.id, row.id));

    await next();
    statusCode = c.res.status;
  } catch (err) {
    statusCode = err instanceof AppError ? err.status : 500;
    throw err;
  } finally {
    try {
      await db.insert(apiRequestLogs).values({
        apiKeyId: row.id,
        requestId: c.get('requestId') ?? '',
        method: c.req.method,
        path: c.req.path,
        statusCode,
        ip,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    } catch (e) {
      console.error('api audit log failed:', e);
    }
  }
};

/** 校验 scope（v1 路由内调用） */
export function requireScope(c: Context<AppContext>, scope: ApiScope): void {
  const apiKey = c.get('apiKey');
  if (!apiKey || !apiKey.scopes.includes(scope)) {
    throw new AppError('forbidden', `需要 API scope: ${scope}`);
  }
}
