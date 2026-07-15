import { AVATAR_MAX_BYTES, type UploadAvatarRequest } from '@hpc-mail/shared';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import type { Env } from '../types.js';

/** avatar_key 短 hash（FNV-1a），用作 URL 版本号 */
function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 头像访问 URL：`/api/avatar/{userId}?v={hash}`；avatar_key 每次上传变，?v 随之变，换头像即时生效 */
export function avatarUrl(userId: number, avatarKey: string | null): string | null {
  if (!avatarKey) return null;
  return `/api/avatar/${userId}?v=${shortHash(avatarKey)}`;
}

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** 上传头像：base64 → R2（每次新随机 key）→ 更新 avatar_key → 删旧对象，返回新 avatarUrl */
export async function uploadAvatar(
  env: Env,
  userId: number,
  req: UploadAvatarRequest,
): Promise<string> {
  const bytes = decodeBase64(req.image);
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    throw new AppError('payload_too_large', '头像图片不能超过 2MB');
  }
  const db = createDb(env);
  const current = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  const key = `avatar/${userId}/${crypto.randomUUID().replace(/-/g, '')}`;
  await env.r2.put(key, bytes, { httpMetadata: { contentType: req.contentType } });
  await db.update(users).set({ avatarKey: key }).where(eq(users.id, userId));

  // 删旧头像对象，避免孤儿（best-effort）
  if (current?.avatarKey && current.avatarKey !== key) {
    try {
      await env.r2.delete(current.avatarKey);
    } catch (e) {
      console.error('删除旧头像失败:', e);
    }
  }
  return avatarUrl(userId, key)!;
}

/** 删除头像：清 R2 对象 + 置空 avatar_key */
export async function deleteAvatar(env: Env, userId: number): Promise<void> {
  const db = createDb(env);
  const current = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!current?.avatarKey) return;
  await db.update(users).set({ avatarKey: null }).where(eq(users.id, userId));
  try {
    await env.r2.delete(current.avatarKey);
  } catch (e) {
    console.error('删除头像对象失败:', e);
  }
}

/** 取用户头像 R2 对象（供公开 GET /api/avatar/:userId 下发）；无头像返回 null */
export async function getAvatarObject(env: Env, userId: number): Promise<R2ObjectBody | null> {
  const db = createDb(env);
  const row = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row?.avatarKey) return null;
  return env.r2.get(row.avatarKey);
}
