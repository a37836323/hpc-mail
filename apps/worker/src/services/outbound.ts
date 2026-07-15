import type { MessageSummary, Role, SendMailRequest } from '@hpc-mail/shared';
import { and, eq } from 'drizzle-orm';
import { createDb, type Db } from '../db/client.js';
import { attachments as attachmentsTable, mailboxes, messages } from '../db/schema.js';
import {
  assertNoHeaderInjection,
  getEmailDomain,
  normalizeEmail,
} from '../lib/email-address.js';
import { AppError } from '../lib/errors.js';
import { makePreview } from '../lib/text.js';
import type { Env, ExecCtx } from '../types.js';
import { extractCodeByRegex } from './code-extract.js';
import { sendFeishuNotification } from './feishu.js';
import { getSettings } from './setting.js';
import { attachmentKey, getExt, sha256Hex16 } from './storage.js';

export interface Sender {
  userId: number;
  role: Role;
}

interface DecodedAttachment {
  filename: string;
  mimeType: string;
  contentId: string;
  disposition: string;
  bytes: Uint8Array;
  base64: string;
}

interface ResolvedFrom {
  address: string;
  domain: string;
  displayName: string;
}

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function resolveFrom(env: Env, sender: Sender, req: SendMailRequest): Promise<ResolvedFrom> {
  const db = createDb(env);
  if (req.from.mailboxId !== undefined) {
    const box = await db
      .select()
      .from(mailboxes)
      .where(eq(mailboxes.id, req.from.mailboxId))
      .get();
    if (!box) throw new AppError('not_found', '发件邮箱不存在');
    if (sender.role !== 'admin' && box.userId !== sender.userId) {
      throw new AppError('forbidden', '无权使用该发件地址');
    }
    const displayName = (req.from.displayName || box.displayName || box.address.split('@')[0]!).trim();
    assertNoHeaderInjection(displayName);
    return { address: box.address, domain: box.domain, displayName };
  }

  const domain = req.from.domain!;
  const address = `${req.from.localPart!}@${domain}`;
  if (!env.domain.includes(domain)) {
    throw new AppError('validation_failed', '发件域名不在系统域名列表内');
  }
  if (sender.role !== 'admin') {
    const owned = await db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(and(eq(mailboxes.address, address), eq(mailboxes.userId, sender.userId)))
      .get();
    if (!owned) throw new AppError('forbidden', '只能使用自己认领的地址发件');
  }
  const displayName = (req.from.displayName || req.from.localPart!).trim();
  assertNoHeaderInjection(displayName);
  return { address, domain, displayName };
}

async function persistAttachments(
  env: Env,
  db: Db,
  messageId: number,
  atts: DecodedAttachment[],
): Promise<void> {
  if (!atts.length) return;
  const rows = [];
  for (let seq = 0; seq < atts.length; seq++) {
    const att = atts[seq]!;
    const hash16 = await sha256Hex16(att.bytes);
    const key = attachmentKey(messageId, seq, hash16, getExt(att.filename));
    await env.r2.put(key, att.bytes, { httpMetadata: { contentType: att.mimeType } });
    rows.push({
      messageId,
      r2Key: key,
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.bytes.byteLength,
      contentId: att.contentId,
      disposition: att.disposition,
    });
  }
  await db.insert(attachmentsTable).values(rows);
}

/** Cloudflare 原生发信：逐个已验证 destination 发送（send_email binding） */
async function sendViaCloudflare(
  env: Env,
  from: ResolvedFrom,
  toAddr: string,
  req: SendMailRequest,
  atts: DecodedAttachment[],
): Promise<void> {
  // 动态 import：`cloudflare:email` 在 vitest workerd 里静态加载会崩，
  // 且集成测试不发外部邮件，延迟到真实发送时才加载
  const [{ EmailMessage }, { createMimeMessage }] = await Promise.all([
    import('cloudflare:email'),
    import('mimetext/browser'),
  ]);
  const msg = createMimeMessage();
  msg.setSender({ name: from.displayName, addr: from.address });
  msg.setRecipient(toAddr);
  msg.setSubject(req.subject);
  if (req.text) msg.addMessage({ contentType: 'text/plain', data: req.text });
  if (req.html) msg.addMessage({ contentType: 'text/html', data: req.html });
  for (const a of atts) {
    msg.addAttachment({ filename: a.filename, contentType: a.mimeType, data: a.base64 });
  }
  const message = new EmailMessage(from.address, toAddr, msg.asRaw());
  await env.email.send(message);
}

async function sendViaResend(
  token: string,
  from: string,
  recipients: { to: string[]; cc: string[]; bcc: string[] },
  req: SendMailRequest,
  atts: DecodedAttachment[],
): Promise<{ id: string }> {
  const payload: Record<string, unknown> = {
    from,
    to: recipients.to,
    subject: req.subject,
  };
  if (recipients.cc.length) payload.cc = recipients.cc;
  if (recipients.bcc.length) payload.bcc = recipients.bcc;
  if (req.text) payload.text = req.text;
  if (req.html) payload.html = req.html;
  if (atts.length) {
    payload.attachments = atts.map((a) => ({
      filename: a.filename,
      content: a.base64,
      content_type: a.mimeType,
    }));
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await resp.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!resp.ok || !data.id) {
    throw new AppError('internal', `Resend 发送失败: ${data.message ?? resp.status}`);
  }
  return { id: data.id };
}

function summarize(row: typeof messages.$inferSelect, hasAttachments: boolean): MessageSummary {
  return {
    id: row.id,
    direction: row.direction,
    address: row.address,
    domain: row.domain,
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    subject: row.subject,
    preview: row.preview,
    verificationCode: row.verificationCode,
    status: row.status,
    isRead: row.isRead,
    hasAttachments,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 发件链路：身份校验 → 站外 Resend / 站内落库 → outbound 行落库 */
export async function sendMail(
  env: Env,
  ctx: ExecCtx,
  sender: Sender,
  req: SendMailRequest,
): Promise<MessageSummary> {
  assertNoHeaderInjection(req.subject);
  const settings = await getSettings(env);
  const db = createDb(env);
  const from = await resolveFrom(env, sender, req);

  const decoded: DecodedAttachment[] = req.attachments.map((a) => ({
    filename: a.filename,
    mimeType: a.contentType,
    contentId: '',
    disposition: 'attachment',
    bytes: decodeBase64(a.content),
    base64: a.content,
  }));

  const allRecipients = [...req.to, ...req.cc, ...req.bcc].map(normalizeEmail);
  const isInternal = (addr: string) => env.domain.includes(getEmailDomain(addr));
  const externalTargets = [...new Set(allRecipients.filter((a) => !isInternal(a)))];
  const internalTargets = [...new Set(allRecipients.filter(isInternal))];
  const hasExternal = externalTargets.length > 0;

  const text = req.text ?? '';
  const html = req.html ?? '';
  const preview = makePreview(text, html);
  const size = new TextEncoder().encode(text + html).length;
  const code = settings.code_extract.enabled ? extractCodeByRegex(req.subject, text) : '';

  // 站外发送：Cloudflare 原生优先（已验证 destination），失败回退 Resend（若配了该域 token）
  let resendId: string | null = null;
  let status = hasExternal ? 'sent' : 'delivered';
  let errorDetail = '';
  let sendChannel = hasExternal ? 'cloudflare' : 'internal';
  if (hasExternal) {
    const token = settings.resend.tokens[from.domain];
    const channelsUsed = new Set<string>();
    const failures: string[] = [];
    for (const addr of externalTargets) {
      try {
        await sendViaCloudflare(env, from, addr, req, decoded);
        channelsUsed.add('cloudflare');
      } catch (cfErr) {
        const cfMsg = cfErr instanceof Error ? cfErr.message : String(cfErr);
        if (token) {
          try {
            const result = await sendViaResend(
              token,
              `${from.displayName} <${from.address}>`,
              { to: [addr], cc: [], bcc: [] },
              req,
              decoded,
            );
            resendId = result.id;
            channelsUsed.add('resend');
          } catch (rErr) {
            failures.push(`${addr}: ${rErr instanceof Error ? rErr.message : String(rErr)}`);
          }
        } else {
          failures.push(`${addr}: ${cfMsg}（Cloudflare 仅支持已验证地址，且该域未配 Resend token）`);
        }
      }
    }
    sendChannel = [...channelsUsed].join('+') || 'cloudflare';
    if (failures.length === externalTargets.length) {
      status = 'failed';
      errorDetail = failures.join('; ');
    } else if (failures.length) {
      status = 'sent';
      errorDetail = `部分收件人失败: ${failures.join('; ')}`;
    }
  }

  // outbound 行落库
  const outbound = await db
    .insert(messages)
    .values({
      direction: 'outbound',
      address: from.address,
      domain: from.domain,
      fromAddress: from.address,
      fromName: from.displayName,
      recipients: { to: req.to, cc: req.cc, bcc: req.bcc },
      subject: req.subject,
      preview,
      bodyText: text,
      bodyHtml: html,
      verificationCode: code,
      status,
      sendChannel,
      resendId,
      errorDetail,
      isRead: true,
      size,
      createdAt: new Date(),
    })
    .returning()
    .get();
  await persistAttachments(env, db, outbound!.id, decoded);

  if (status === 'failed') {
    throw new AppError('internal', errorDetail || '发送失败');
  }

  // 站内互投：逐地址构造 inbound 行（含提码），同步落库保证即时可见
  const internalRows: number[] = [];
  for (const target of internalTargets) {
    const inbound = await db
      .insert(messages)
      .values({
        direction: 'inbound',
        address: target,
        domain: getEmailDomain(target),
        fromAddress: from.address,
        fromName: from.displayName,
        recipients: { to: req.to, cc: req.cc, bcc: req.bcc },
        subject: req.subject,
        preview,
        bodyText: text,
        bodyHtml: html,
        verificationCode: code,
        status: 'received',
        sendChannel: 'internal',
        isRead: false,
        size,
        createdAt: new Date(),
      })
      .returning({ id: messages.id })
      .get();
    internalRows.push(inbound!.id);
    await persistAttachments(env, db, inbound!.id, decoded);
  }

  // 站内互投飞书通知（异步，逐地址 try/catch）
  if (internalTargets.length && settings.feishu.enabled) {
    ctx.waitUntil(
      (async () => {
        for (const target of internalTargets) {
          try {
            await sendFeishuNotification(env, settings, {
              subject: req.subject,
              fromAddress: from.address,
              fromName: from.displayName,
              toAddress: target,
              code,
              preview,
            });
          } catch (e) {
            console.error('站内互投飞书通知失败:', e);
          }
        }
      })(),
    );
  }

  return summarize(outbound!, decoded.length > 0);
}
