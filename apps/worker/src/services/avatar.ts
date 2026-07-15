import { AVATAR_MAX_BYTES, type UploadAvatarRequest } from '@hpc-mail/shared';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import type { Env } from '../types.js';

/** 头像访问 URL：`/api/avatar/{userId}?v={版本}`（版本随 avatarKey 变化防缓存）；无头像为 null */
export function avatarUrl(userId: number, avatarKey: string | null): string | null {
  if (!avatarKey) return null;
  const version = avatarKey.slice(-12);
  return `/api/avatar/${userId}?v=${version}`;
}

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** 上传头像：落 R2、删除旧对象、更新 avatar_key，返回新 avatarUrl */
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

  // 删除旧头像对象（best-effort）
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

/** 取用户头像 R2 对象（供 GET /api/avatar/:userId 公开下发）；无头像返回 null */
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
