import type { MessageRecipients } from '@hpc-mail/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createDb } from '../db/client.js';
import { messages } from '../db/schema.js';
import { hmacSha256Base64, timingSafeEqualStr } from '../lib/crypto.js';
import { sendFeishuNotification } from '../services/feishu.js';
import { getSettings } from '../services/setting.js';
import type { AppContext } from '../types.js';

const ALERT_STATUSES = new Set(['bounced', 'failed', 'complained']);

const app = new Hono<AppContext>();
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

const STATUS_MAP: Record<string, { status: string; useReason?: boolean; useBounce?: boolean }> = {
  'email.delivered': { status: 'delivered' },
  'email.bounced': { status: 'bounced', useBounce: true },
  'email.complained': { status: 'complained' },
  'email.delivery_delayed': { status: 'delayed' },
  'email.failed': { status: 'failed', useReason: true },
};

/** Resend webhook：svix 签名校验后回写 outbound 状态 */
app.post('/resend', async (c) => {
  const secret = c.env.resend_webhook_secret;
  if (!secret) return c.json({ error: { code: 'not_found', message: 'webhook 未配置' }, requestId: c.get('requestId') }, 501);

  const svixId = c.req.header('svix-id');
  const svixTimestamp = c.req.header('svix-timestamp');
  const svixSignature = c.req.header('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return c.json({ error: { code: 'unauthorized', message: '缺少签名头' }, requestId: c.get('requestId') }, 401);
  }

  const ts = Number(svixTimestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
    return c.json({ error: { code: 'unauthorized', message: '签名时间戳超出容忍窗口' }, requestId: c.get('requestId') }, 401);
  }

  const payload = await c.req.text();
  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (ch) => ch.charCodeAt(0));
  const expected = await hmacSha256Base64(secretBytes, signedContent);

  const provided = svixSignature.split(' ').map((part) => part.split(',')[1] ?? part);
  const matched = provided.some((sig) => timingSafeEqualStr(sig, expected));
  if (!matched) {
    return c.json({ error: { code: 'unauthorized', message: '签名校验失败' }, requestId: c.get('requestId') }, 401);
  }

  let body: { type?: string; data?: { email_id?: string; bounce?: unknown; failed?: { reason?: string } } };
  try {
    body = JSON.parse(payload);
  } catch {
    return c.json({ error: { code: 'validation_failed', message: '非法 JSON' }, requestId: c.get('requestId') }, 400);
  }

  const mapping = body.type ? STATUS_MAP[body.type] : undefined;
  const emailId = body.data?.email_id;
  if (mapping && emailId) {
    let errorDetail = '';
    if (mapping.useBounce && body.data?.bounce) errorDetail = JSON.stringify(body.data.bounce).slice(0, 1000);
    if (mapping.useReason) errorDetail = String(body.data?.failed?.reason ?? '').slice(0, 1000);
    const db = createDb(c.env);
    await db
      .update(messages)
      .set({ status: mapping.status, ...(errorDetail ? { errorDetail } : {}) })
      .where(eq(messages.resendId, emailId));

    // 外发失败/退信/投诉：异步推送飞书告警（否则失败是黑洞，发件人无从得知）
    if (ALERT_STATUSES.has(mapping.status)) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const settings = await getSettings(c.env);
            if (!settings.feishu.enabled) return;
            const msg = await db.select().from(messages).where(eq(messages.resendId, emailId)).get();
            if (!msg) return;
            const recips = msg.recipients as MessageRecipients;
            await sendFeishuNotification(c.env, settings, {
              subject: `⚠ 外发${mapping.status === 'bounced' ? '退信' : mapping.status === 'complained' ? '被投诉' : '失败'}：${msg.subject}`,
              fromAddress: msg.fromAddress,
              fromName: msg.fromName,
              toAddress: recips.to?.[0] ?? msg.address,
              code: '',
              body: errorDetail || `外发邮件状态更新为 ${mapping.status}`,
            });
          } catch (e) {
            console.error('bounce 飞书告警失败:', e);
          }
        })(),
      );
    }
  }

  return c.json({ data: { received: true } });
});

export default app;
