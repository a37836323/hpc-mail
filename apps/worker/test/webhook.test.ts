import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { messages } from '../src/db/schema.js';
import { hmacSha256Base64 } from '../src/lib/crypto.js';

const app = createApp();

async function seedOutbound(resendId: string): Promise<void> {
  const db = createDb(env);
  await db.insert(messages).values({
    direction: 'outbound',
    address: 'me@hpc.email',
    domain: 'hpc.email',
    fromAddress: 'me@hpc.email',
    subject: 'sent',
    status: 'sent',
    resendId,
    createdAt: new Date(),
  });
}

function secretBytes(): Uint8Array {
  const raw = (env.resend_webhook_secret ?? '').replace(/^whsec_/, '');
  return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
}

async function post(payload: string, signature: string, ts: string): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await app.request(
    '/api/webhooks/resend',
    {
      method: 'POST',
      headers: {
        'svix-id': 'msg_test',
        'svix-timestamp': ts,
        'svix-signature': signature,
        'Content-Type': 'application/json',
      },
      body: payload,
    },
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

describe('Resend webhook svix 签名校验', () => {
  it('合法签名回写状态', async () => {
    await seedOutbound('email_abc');
    const ts = Math.floor(Date.now() / 1000).toString();
    const payload = JSON.stringify({ type: 'email.delivered', data: { email_id: 'email_abc' } });
    const expected = await hmacSha256Base64(secretBytes(), `msg_test.${ts}.${payload}`);
    const res = await post(payload, `v1,${expected}`, ts);
    expect(res.status).toBe(200);

    const db = createDb(env);
    const row = await db.select().from(messages).where(eq(messages.resendId, 'email_abc')).get();
    expect(row?.status).toBe('delivered');
  });

  it('错误签名返回 401', async () => {
    await seedOutbound('email_xyz');
    const ts = Math.floor(Date.now() / 1000).toString();
    const payload = JSON.stringify({ type: 'email.bounced', data: { email_id: 'email_xyz' } });
    const res = await post(payload, 'v1,not-a-valid-signature', ts);
    expect(res.status).toBe(401);
  });

  it('过期时间戳返回 401', async () => {
    const oldTs = (Math.floor(Date.now() / 1000) - 3600).toString();
    const payload = JSON.stringify({ type: 'email.delivered', data: { email_id: 'x' } });
    const expected = await hmacSha256Base64(secretBytes(), `msg_test.${oldTs}.${payload}`);
    const res = await post(payload, `v1,${expected}`, oldTs);
    expect(res.status).toBe(401);
  });
});
