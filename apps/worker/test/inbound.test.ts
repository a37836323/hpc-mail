import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createDb } from '../src/db/client.js';
import { mailboxes, messages, users } from '../src/db/schema.js';
import { handleInbound } from '../src/services/inbound.js';
import { updateUserNotifyPrefs } from '../src/services/notify-prefs.js';
import { updateSettings } from '../src/services/setting.js';
import type { ExecCtx } from '../src/types.js';

async function seedUser(username: string, role: 'admin' | 'user'): Promise<number> {
  const db = createDb(env);
  const [row] = await db
    .insert(users)
    .values({ username, passwordHash: 'x', role, status: 'active' })
    .returning({ id: users.id });
  return row!.id;
}

async function claim(userId: number, address: string): Promise<void> {
  const db = createDb(env);
  await db
    .insert(mailboxes)
    .values({ address, domain: address.split('@')[1]!, userId, displayName: '' });
}

function rawEmail(to: string, subject: string, body: string): ReadableStream {
  const raw = [
    'From: Sender Name <sender@example.com>',
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
    '',
  ].join('\r\n');
  return new Response(raw).body!;
}

function mockMessage(to: string, subject: string, body: string, forward: () => Promise<void>) {
  return {
    raw: rawEmail(to, subject, body),
    to,
    from: 'sender@example.com',
    forward: vi.fn(forward),
    setReject: vi.fn(),
  };
}

async function run(msg: unknown): Promise<void> {
  const ctx = createExecutionContext() as unknown as ExecCtx;
  await handleInbound(msg as unknown as ForwardableEmailMessage, env, ctx);
  await waitOnExecutionContext(ctx as never);
}

describe('收件链路 handleInbound', () => {
  it('落库 + 正则提码 + 未认领地址按管理员个人转发', async () => {
    // 未认领地址归管理员；用管理员的个人转发目标
    const adminId = await seedUser('inb-admin', 'admin');
    await updateUserNotifyPrefs(env, adminId, {
      forward: { enabled: true, addresses: ['riba2534.me@gmail.com'] },
    });

    const forward = vi.fn(async () => {});
    const msg = {
      raw: rawEmail('test1@claude-router.cc', 'Login code', 'Your verification code is 123456.'),
      to: 'test1@claude-router.cc',
      from: 'sender@example.com',
      forward,
      setReject: vi.fn(),
    };
    await run(msg);

    const db = createDb(env);
    const row = await db
      .select()
      .from(messages)
      .where(eq(messages.address, 'test1@claude-router.cc'))
      .get();
    expect(row).toBeTruthy();
    expect(row!.direction).toBe('inbound');
    expect(row!.subject).toBe('Login code');
    expect(row!.verificationCode).toBe('123456');
    expect(row!.preview).toContain('verification code');
    expect(forward).toHaveBeenCalledWith('riba2534.me@gmail.com');
  });

  it('已认领地址按认领用户的个人转发，不外溢到管理员', async () => {
    // 本地 workerd 无 AI 绑定，正文无码会触发 AI 兜底 → 显式关闭
    await updateSettings(env, { code_extract: { enabled: true, aiEnabled: false } });
    const adminId = await seedUser('inb-admin2', 'admin');
    await updateUserNotifyPrefs(env, adminId, {
      forward: { enabled: true, addresses: ['admin-box@gmail.com'] },
    });
    const userId = await seedUser('inb-user', 'user');
    await claim(userId, 'claimed@happyclaw.cc');
    await updateUserNotifyPrefs(env, userId, {
      forward: { enabled: true, addresses: ['user-box@gmail.com'] },
    });

    const forward = vi.fn(async () => {});
    const msg = mockMessage('claimed@happyclaw.cc', 'Hi', 'no code here', async () => {});
    msg.forward = forward;
    await run(msg);

    expect(forward).toHaveBeenCalledWith('user-box@gmail.com');
    expect(forward).not.toHaveBeenCalledWith('admin-box@gmail.com');
  });

  it('owner 未开启转发时不调用 forward', async () => {
    await updateSettings(env, { code_extract: { enabled: true, aiEnabled: false } });
    const userId = await seedUser('inb-noforward', 'user');
    await claim(userId, 'noforward@happyclaw.cc'); // 无个人偏好 → 转发默认关闭

    const forward = vi.fn(async () => {});
    const msg = mockMessage('noforward@happyclaw.cc', 'Hi there', 'no codes here', async () => {});
    msg.forward = forward;
    await run(msg);

    const db = createDb(env);
    const row = await db
      .select()
      .from(messages)
      .where(eq(messages.address, 'noforward@happyclaw.cc'))
      .get();
    expect(row).toBeTruthy();
    expect(row!.verificationCode).toBe('');
    expect(forward).not.toHaveBeenCalled();
  });
});
