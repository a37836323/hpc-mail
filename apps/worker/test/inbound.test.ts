import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createDb } from '../src/db/client.js';
import { messages } from '../src/db/schema.js';
import { handleInbound } from '../src/services/inbound.js';
import { updateSettings } from '../src/services/setting.js';
import type { ExecCtx } from '../src/types.js';

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

describe('收件链路 handleInbound', () => {
  it('落库 + 正则提码 + Gmail 转发调用', async () => {
    await updateSettings(env, {
      gmail_forward: { enabled: true, addresses: ['riba2534.me@gmail.com'] },
    });

    const forward = vi.fn(async () => {});
    const msg = {
      raw: rawEmail('test1@claude-router.cc', 'Login code', 'Your verification code is 123456.'),
      to: 'test1@claude-router.cc',
      from: 'sender@example.com',
      forward,
      setReject: vi.fn(),
    };

    const ctx = createExecutionContext() as unknown as ExecCtx;
    await handleInbound(msg as unknown as ForwardableEmailMessage, env, ctx);
    await waitOnExecutionContext(ctx as never);

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
    expect(row!.fromAddress).toBe('sender@example.com');
    expect(row!.preview).toContain('verification code');

    expect(forward).toHaveBeenCalledWith('riba2534.me@gmail.com');
  });

  it('转发关闭时不调用 forward', async () => {
    // 本地 workerd 无法调 AI 绑定（Binding ai needs to be run remotely），
    // 正文无验证码会触发 AI 兜底，必须显式关掉
    await updateSettings(env, {
      gmail_forward: { enabled: false, addresses: [] },
      code_extract: { enabled: true, aiEnabled: false },
    });
    const forward = vi.fn(async () => {});
    const msg = mockMessage('hello@hpc.email', 'Hi there', 'no codes here', async () => {});
    msg.forward = forward;

    const ctx = createExecutionContext() as unknown as ExecCtx;
    await handleInbound(msg as unknown as ForwardableEmailMessage, env, ctx);
    await waitOnExecutionContext(ctx as never);

    const db = createDb(env);
    const row = await db
      .select()
      .from(messages)
      .where(eq(messages.address, 'hello@hpc.email'))
      .get();
    expect(row).toBeTruthy();
    expect(row!.verificationCode).toBe('');
    expect(forward).not.toHaveBeenCalled();
  });
});
