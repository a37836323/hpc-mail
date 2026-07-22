import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { users } from '../src/db/schema.js';
import { hashPassword } from '../src/lib/password.js';
import { updateSettings } from '../src/services/setting.js';

const app = createApp();

async function request(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await app.request(path, init, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function seedAdmin(): Promise<void> {
  const db = createDb(env);
  // 同文件多个用例共享存储，重复 seed 直接忽略
  await db
    .insert(users)
    .values({
      username: 'admin',
      passwordHash: await hashPassword('admin-pass-123'),
      role: 'admin',
      status: 'active',
    })
    .onConflictDoNothing();
}

describe('信封与鉴权链路', () => {
  it('GET /api/config 返回公开配置信封（域名来自 settings）', async () => {
    await updateSettings(env, {
      domains: {
        list: [
          { domain: 'hpc.email', public: true, perUserLimit: 0 },
          { domain: 'inbox.test', public: true, perUserLimit: 0 },
        ],
      },
    });
    const res = await request('/api/config');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { registrationMode: string; domains: string[] } };
    expect(body.data.registrationMode).toBe('closed');
    // config 只暴露公开域名
    expect(body.data.domains).toContain('hpc.email');
  });

  it('登录 → me → 登出 → 旧 token 失效', async () => {
    await seedAdmin();
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin-pass-123' }),
    });
    expect(loginRes.status).toBe(200);
    const login = (await loginRes.json()) as { data: { token: string; user: { role: string } } };
    expect(login.data.user.role).toBe('admin');
    const token = login.data.token;

    const meRes = await request('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    expect(meRes.status).toBe(200);
    const me = (await meRes.json()) as { data: { username: string } };
    expect(me.data.username).toBe('admin');

    const logoutRes = await request('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logoutRes.status).toBe(200);

    const afterRes = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(afterRes.status).toBe(401);
  });

  it('错误密码返回 bad_credentials', async () => {
    await seedAdmin();
    const res = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string }; requestId: string };
    expect(body.error.code).toBe('bad_credentials');
    expect(body.requestId).toBeTruthy();
  });

  it('closed 模式注册被拒且带 requestId', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'newuser', password: 'password123' }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string }; requestId: string };
    expect(body.error.code).toBe('registration_closed');
    expect(body.requestId).toBeTruthy();
  });

  it('/v1 无 key 返回 401 带 requestId', async () => {
    const res = await request('/v1/status');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string }; requestId: string };
    expect(body.requestId).toBeTruthy();
  });
});
