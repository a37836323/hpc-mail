import type { Env } from '../types.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const sessKey = (sid: string) => `sess:${sid}`;
const uepochKey = (userId: number) => `uepoch:${userId}`;
const INSTANCE_EPOCH_KEY = 'instance_epoch';

/** 创建会话（KV 标记 + TTL），返回 sid */
export async function createSession(env: Env, userId: number): Promise<string> {
  const sid = crypto.randomUUID();
  await env.kv.put(sessKey(sid), JSON.stringify({ userId, createdAt: Date.now() }), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return sid;
}

export async function sessionExists(env: Env, sid: string): Promise<boolean> {
  return (await env.kv.get(sessKey(sid))) !== null;
}

export async function destroySession(env: Env, sid: string): Promise<void> {
  await env.kv.delete(sessKey(sid));
}

/** 用户代（改密/禁用 +1 即时踢会话）；缺省视为 0 */
export async function getUserEpoch(env: Env, userId: number): Promise<number> {
  const v = await env.kv.get(uepochKey(userId));
  return v ? Number(v) || 0 : 0;
}

export async function bumpUserEpoch(env: Env, userId: number): Promise<number> {
  const next = (await getUserEpoch(env, userId)) + 1;
  await env.kv.put(uepochKey(userId), String(next));
  return next;
}

/** 实例代（清库全员下线）；缺省视为 0 */
export async function getInstanceEpoch(env: Env): Promise<number> {
  const v = await env.kv.get(INSTANCE_EPOCH_KEY);
  return v ? Number(v) || 0 : 0;
}

export { SESSION_TTL_SECONDS };
