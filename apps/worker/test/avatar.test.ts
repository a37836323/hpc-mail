import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { users } from '../src/db/schema.js';
import { avatarUrl, deleteAvatar, getAvatarObject, uploadAvatar } from '../src/services/avatar.js';
import { listUsers } from '../src/services/user.js';

const app = createApp();
// 1x1 透明 PNG
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function seedUser(username: string, role: 'admin' | 'user' = 'user'): Promise<number> {
  const db = createDb(env);
  const [row] = await db
    .insert(users)
    .values({ username, passwordHash: 'x', role, status: 'active' })
    .returning({ id: users.id });
  return row!.id;
}

describe('avatarUrl helper', () => {
  it('无 key 返回 null，有 key 返回带版本号 URL', () => {
    expect(avatarUrl(5, null)).toBeNull();
    expect(avatarUrl(5, 'avatar/5/abcdef0123456789')).toMatch(/^\/api\/avatar\/5\?v=/);
  });
});

describe('头像上传 / 公开下发 / 删除', () => {
  it('上传落库 + GET 公开下发 + 删除后 404', async () => {
    const uid = await seedUser('avatar-user');
    const url = await uploadAvatar(env, uid, { contentType: 'image/png', image: PNG_1X1 });
    expect(url).toMatch(new RegExp(`^/api/avatar/${uid}\\?v=`));

    const db = createDb(env);
    const row = await db.select().from(users).where(eq(users.id, uid)).get();
    expect(row!.avatarKey).toMatch(new RegExp(`^avatar/${uid}/`));
    expect(await getAvatarObject(env, uid)).not.toBeNull();

    const ctx = createExecutionContext();
    const res = await app.request(`/api/avatar/${uid}`, {}, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');

    await deleteAvatar(env, uid);
    const after = await db.select().from(users).where(eq(users.id, uid)).get();
    expect(after!.avatarKey).toBeNull();

    const ctx2 = createExecutionContext();
    const res2 = await app.request(`/api/avatar/${uid}`, {}, env, ctx2);
    await waitOnExecutionContext(ctx2);
    expect(res2.status).toBe(404);
  });

  it('重复上传替换旧 key', async () => {
    const uid = await seedUser('avatar-replace');
    await uploadAvatar(env, uid, { contentType: 'image/png', image: PNG_1X1 });
    const db = createDb(env);
    const first = (await db.select().from(users).where(eq(users.id, uid)).get())!.avatarKey;
    await uploadAvatar(env, uid, { contentType: 'image/webp', image: PNG_1X1 });
    const second = (await db.select().from(users).where(eq(users.id, uid)).get())!.avatarKey;
    expect(second).not.toBe(first);
  });

  it('未上传头像时 GET 返回 404', async () => {
    const uid = await seedUser('no-avatar-get');
    const ctx = createExecutionContext();
    const res = await app.request(`/api/avatar/${uid}`, {}, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });
});

describe('admin 用户列表带 avatarUrl', () => {
  it('有头像 avatarUrl 非空，无头像为 null', async () => {
    const withAvatar = await seedUser('has-avatar');
    await uploadAvatar(env, withAvatar, { contentType: 'image/png', image: PNG_1X1 });
    await seedUser('no-avatar');

    const list = await listUsers(env);
    expect(list.find((u) => u.id === withAvatar)?.avatarUrl).toMatch(/^\/api\/avatar\//);
    expect(list.find((u) => u.username === 'no-avatar')?.avatarUrl).toBeNull();
  });
});
