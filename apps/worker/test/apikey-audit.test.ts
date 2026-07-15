import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { apiRequestLogs, users } from '../src/db/schema.js';
import { createApiKey } from '../src/services/api-key.js';

const app = createApp();

async function seedUser(username: string): Promise<number> {
  const db = createDb(env);
  const [row] = await db
    .insert(users)
    .values({ username, passwordHash: 'x', role: 'user', status: 'active' })
    .returning({ id: users.id });
  return row!.id;
}

describe('API Key 审计：被拒调用也记录', () => {
  it('IP 白名单拒绝的 403 调用产生一条审计记录', async () => {
    const uid = await seedUser('apiuser');
    const created = await createApiKey(env, uid, {
      name: 'ip-locked',
      scopes: ['mail.read'],
      rateLimit: 120,
      allowedIps: ['1.2.3.4'],
    });

    const ctx = createExecutionContext();
    const res = await app.request(
      '/v1/status',
      { headers: { Authorization: `Bearer ${created.key}`, 'CF-Connecting-IP': '9.9.9.9' } },
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(403);

    const db = createDb(env);
    const logs = await db
      .select()
      .from(apiRequestLogs)
      .where(eq(apiRequestLogs.apiKeyId, created.id))
      .all();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.statusCode).toBe(403);
    expect(logs[0]!.ip).toBe('9.9.9.9');
    expect(logs[0]!.path).toBe('/v1/status');
  });

  it('成功调用记录 statusCode=200', async () => {
    const uid = await seedUser('apiuser2');
    const created = await createApiKey(env, uid, {
      name: 'ok-key',
      scopes: ['mail.read'],
      rateLimit: 120,
      allowedIps: [],
    });

    const ctx = createExecutionContext();
    const res = await app.request(
      '/v1/status',
      { headers: { Authorization: `Bearer ${created.key}`, 'CF-Connecting-IP': '9.9.9.9' } },
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);

    const db = createDb(env);
    const logs = await db
      .select()
      .from(apiRequestLogs)
      .where(eq(apiRequestLogs.apiKeyId, created.id))
      .all();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.statusCode).toBe(200);
  });
});
