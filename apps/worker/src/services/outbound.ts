import {
  EXTERNAL_MESSAGE_MAX_BYTES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_TOTAL_BYTES,
  type MessageSummary,
  type Role,
} from '@hpc-mail/shared';
import { and, eq } from 'drizzle-orm';
import { createDb, type Db } from '../db/client.js';
import { attachments as attachmentsTable, mailboxes, messages } from '../db/schema.js';
import {
  assertNoHeaderInjection,
  getEmailDomain,
  normalizeEmail,
} from '../lib/email-address.js';
import { AppError } from '../lib/errors.js';
import { foldBase64 } from '../lib/mime.js';
import { makePreview } from '../lib/text.js';
import type { Env, ExecCtx } from '../types.js';
import { extractCodeByRegex } from './code-extract.js';
import { getDomains } from './domain.js';
import { sendFeishuNotification } from './feishu.js';
import { getMailboxOwner } from './mailbox.js';
import { getUserNotifyPrefs } from './notify-prefs.js';
import { getSettings } from './setting.js';
import { getActiveAdminIds } from './user.js';
import { sendNotifyWebhook } from './webhook-notify.js';
import { signAttachment } from '../lib/crypto.js';
import { attachmentKey, getExt, sha256Hex16 } from './storage.js';

/** 外发转链接的附件下载有效期：90 天（外部收件人无登录态，给长有效期） */
const EXTERNAL_LINK_TTL_SECONDS = 90 * 24 * 3600;

export interface Sender {
  userId: number;
  role: Role;
}

export interface DecodedAttachment {
  filename: string;
  mimeType: string;
  contentId: string;
  disposition: string;
  bytes: Uint8Array;
  base64: string;
}

/** sendMail 所需请求字段（base64 内联与 token 引用两种发送的共有子集） */
export interface SendMailInput {
  from: { mailboxId?: number; localPart?: string; domain?: string; displayName?: string };
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text?: string;
  html?: string;
  replyToMessageId?: number;
  forwardAttachmentsFrom?: number;
}

interface ResolvedFrom {
  address: string;
  domain: string;
  displayName: string;
}

/** 回复线程头：In-Reply-To / References */
interface ReplyContext {
  inReplyTo: string;
  references: string;
}

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** 把 /v1 的 base64 内联附件解码为 DecodedAttachment[]（供 route 层调用） */
export function decodeInlineAttachments(
  atts: { filename: string; contentType: string; content: string }[],
): DecodedAttachment[] {
  return atts.map((a) => ({
    filename: a.filename,
    mimeType: a.contentType,
    contentId: '',
    disposition: 'attachment',
    bytes: decodeBase64(a.content),
    base64: a.content,
  }));
}

interface QuotaCounter {
  count: number;
  recipients: number;
}

function quotaKey(userId: number): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `quota:out:${userId}:${day}`;
}

/** 外发日配额校验：仅普通用户 + 有站外收件人时生效（admin 豁免） */
async function assertOutboundQuota(
  env: Env,
  quota: { dailyOutbound: number; dailyRecipients: number },
  sender: Sender,
  externalCount: number,
): Promise<void> {
  if (sender.role === 'admin') return;
  if (quota.dailyOutbound === 0 && quota.dailyRecipients === 0) return;
  const cur =
    ((await env.kv.get(quotaKey(sender.userId), { type: 'json' })) as QuotaCounter | null) ?? {
      count: 0,
      recipients: 0,
    };
  if (quota.dailyOutbound > 0 && cur.count + 1 > quota.dailyOutbound) {
    throw new AppError('rate_limited', `已达每日外发上限（${quota.dailyOutbound} 封），请明日再试`);
  }
  if (quota.dailyRecipients > 0 && cur.recipients + externalCount > quota.dailyRecipients) {
    throw new AppError('rate_limited', `已达每日外发收件人上限（${quota.dailyRecipients}）`);
  }
}

/** 记一次外发消耗（一封 + externalCount 个站外收件人），TTL 3 天自然过期 */
async function bumpOutboundQuota(env: Env, sender: Sender, externalCount: number): Promise<void> {
  if (sender.role === 'admin') return;
  const key = quotaKey(sender.userId);
  const cur =
    ((await env.kv.get(key, { type: 'json' })) as QuotaCounter | null) ?? {
      count: 0,
      recipients: 0,
    };
  cur.count += 1;
  cur.recipients += externalCount;
  await env.kv.put(key, JSON.stringify(cur), { expirationTtl: 3 * 24 * 3600 });
}

async function resolveFrom(
  env: Env,
  sender: Sender,
  req: SendMailInput,
  domains: string[],
): Promise<ResolvedFrom> {
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
  if (!domains.includes(domain)) {
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

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** 转发时把原邮件的附件带入本次发送：校验可见性后从 R2 读回，转成 DecodedAttachment */
async function loadForwardedAttachments(
  env: Env,
  db: Db,
  sender: Sender,
  sourceMessageId: number,
  alreadyCount: number,
): Promise<DecodedAttachment[]> {
  const source = await db.select().from(messages).where(eq(messages.id, sourceMessageId)).get();
  if (!source) return [];
  if (sender.role !== 'admin') {
    const owned = await db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(and(eq(mailboxes.address, source.address), eq(mailboxes.userId, sender.userId)))
      .get();
    if (!owned) throw new AppError('forbidden', '无权转发该邮件的附件');
  }
  const rows = await db
    .select()
    .from(attachmentsTable)
    .where(eq(attachmentsTable.messageId, sourceMessageId))
    .all();
  const out: DecodedAttachment[] = [];
  for (const a of rows) {
    if (alreadyCount + out.length >= MAX_ATTACHMENTS) break;
    const obj = await env.r2.get(a.r2Key);
    if (!obj) continue;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    out.push({
      filename: a.filename,
      mimeType: a.mimeType,
      contentId: '',
      disposition: 'attachment',
      bytes,
      base64: bytesToBase64(bytes),
    });
  }
  return out;
}

async function persistAttachments(
  env: Env,
  db: Db,
  messageId: number,
  atts: DecodedAttachment[],
): Promise<{ id: number; filename: string; size: number }[]> {
  if (!atts.length) return [];
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
  const inserted = await db
    .insert(attachmentsTable)
    .values(rows)
    .returning({
      id: attachmentsTable.id,
      filename: attachmentsTable.filename,
      size: attachmentsTable.size,
    });
  return inserted;
}

/** Cloudflare 原生发信（send_email binding），逐收件人发送 */
async function sendViaCloudflare(
  env: Env,
  from: ResolvedFrom,
  toAddr: string,
  req: SendMailInput,
  atts: DecodedAttachment[],
  reply: ReplyContext | null,
  text: string,
  html: string,
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
  if (reply) {
    msg.setHeader('In-Reply-To', reply.inReplyTo);
    msg.setHeader('References', reply.references);
  }
  if (text) msg.addMessage({ contentType: 'text/plain', data: text });
  if (html) msg.addMessage({ contentType: 'text/html', data: html });
  for (const a of atts) {
    // 折行成 76 字符/行：不折行时整个附件是一整行，超 SMTP 998 字节行限会被下游 MTA 拒收
    msg.addAttachment({ filename: a.filename, contentType: a.mimeType, data: foldBase64(a.base64) });
  }
  const message = new EmailMessage(from.address, toAddr, msg.asRaw());
  await env.email.send(message);
}

function summarize(
  row: typeof messages.$inferSelect,
  hasAttachments: boolean,
  isStarred: boolean,
): MessageSummary {
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
    errorDetail: row.errorDetail ?? '',
    recipientsTo: row.direction === 'outbound' ? (row.recipients?.to ?? []) : undefined,
    isRead: row.isRead,
    isStarred,
    hasAttachments,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 校验并构造回复线程头（回复的原邮件须对发件人可见） */
async function resolveReply(
  db: Db,
  sender: Sender,
  replyToMessageId: number | undefined,
): Promise<{ reply: ReplyContext | null; inReplyTo: string | null }> {
  if (!replyToMessageId) return { reply: null, inReplyTo: null };
  const orig = await db.select().from(messages).where(eq(messages.id, replyToMessageId)).get();
  if (!orig) return { reply: null, inReplyTo: null };
  if (sender.role !== 'admin') {
    const owned = await db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(and(eq(mailboxes.address, orig.address), eq(mailboxes.userId, sender.userId)))
      .get();
    if (!owned) throw new AppError('forbidden', '无权回复该邮件');
  }
  if (!orig.messageId) return { reply: null, inReplyTo: null };
  const references = [orig.inReplyTo, orig.messageId].filter(Boolean).join(' ');
  return { reply: { inReplyTo: orig.messageId, references }, inReplyTo: orig.messageId };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'),
  );
}

interface AttachmentLink {
  filename: string;
  size: number;
  url: string;
}

/**
 * 把附件下载链接追加到正文末尾。
 * 只追加到「原本就存在」的 part：纯文本邮件（html 为空）绝不能凭空造出一个 html part，
 * 否则收件端（QQ/Gmail 等）与站内详情都优先渲染 html，正文会被只含链接的块整个盖掉。
 */
export function injectAttachmentLinks(
  text: string,
  html: string,
  links: AttachmentLink[],
): { text: string; html: string } {
  if (links.length === 0) return { text, html };
  const textBlock =
    `\n\n— 附件下载（链接有效期 90 天）—\n` +
    links.map((l) => `· ${l.filename} (${fmtBytes(l.size)}): ${l.url}`).join('\n');
  const htmlBlock =
    `<br><p>— 附件下载（<em>链接有效期 90 天</em>）—</p><ul>` +
    links.map((l) => `<li><a href="${l.url}">${escapeHtml(l.filename)}</a> (${fmtBytes(l.size)})</li>`).join('') +
    `</ul>`;
  return { text: text ? text + textBlock : '', html: html ? html + htmlBlock : '' };
}

/**
 * 决定外发邮件的实际负载：正文+附件 base64 ≤ 5MiB 时直发附件；超限则附件转下载链接
 * 注入正文、MIME 不带附件（绕过 send_email 5MiB 硬限）。返回最终正文与附件列表。
 */
async function buildExternalPayload(
  env: Env,
  origin: string,
  text: string,
  html: string,
  atts: DecodedAttachment[],
  attRows: { id: number; filename: string; size: number }[],
): Promise<{ text: string; html: string; atts: DecodedAttachment[] }> {
  const bodyBytes = new TextEncoder().encode(`${text}${html}`).length;
  const attBytes = atts.reduce((sum, a) => sum + Math.ceil((a.bytes.byteLength * 4) / 3), 0);
  if (bodyBytes + attBytes <= EXTERNAL_MESSAGE_MAX_BYTES || attRows.length === 0) {
    return { text, html, atts };
  }
  const links: AttachmentLink[] = [];
  for (const r of attRows) {
    const { exp, sig } = await signAttachment(env.jwt_secret, r.id, EXTERNAL_LINK_TTL_SECONDS);
    links.push({
      filename: r.filename,
      size: r.size,
      url: `${origin}/api/attachments/${r.id}?exp=${exp}&sig=${sig}`,
    });
  }
  const injected = injectAttachmentLinks(text, html, links);
  return { text: injected.text, html: injected.html, atts: [] };
}

/** 发件链路：身份校验 → 站外 Cloudflare send_email（超大附件转下载链接）/ 站内落库 → outbound 行落库 */
export async function sendMail(
  env: Env,
  ctx: ExecCtx,
  sender: Sender,
  req: SendMailInput,
  attachments: DecodedAttachment[],
  origin: string,
): Promise<MessageSummary> {
  assertNoHeaderInjection(req.subject);
  const settings = await getSettings(env);
  const db = createDb(env);
  const domains = await getDomains(env, settings);
  const from = await resolveFrom(env, sender, req, domains);

  // 转发携带原附件：从来源邮件读回（校验可见性），追加到本次发送
  if (req.forwardAttachmentsFrom) {
    const forwarded = await loadForwardedAttachments(
      env,
      db,
      sender,
      req.forwardAttachmentsFrom,
      attachments.length,
    );
    attachments = [...attachments, ...forwarded];
    const totalBytes = attachments.reduce((sum, a) => sum + a.bytes.byteLength, 0);
    if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
      throw new AppError(
        'payload_too_large',
        `附件合计超过 ${Math.floor(MAX_ATTACHMENT_TOTAL_BYTES / 1024 / 1024)}MB 上限`,
      );
    }
  }

  const allRecipients = [...req.to, ...req.cc, ...req.bcc].map(normalizeEmail);
  const isInternal = (addr: string) => domains.includes(getEmailDomain(addr));
  const externalTargets = [...new Set(allRecipients.filter((a) => !isInternal(a)))];
  const internalTargets = [...new Set(allRecipients.filter(isInternal))];
  const hasExternal = externalTargets.length > 0;

  const { reply, inReplyTo } = await resolveReply(db, sender, req.replyToMessageId);

  const text = req.text ?? '';
  const html = req.html ?? '';
  const preview = makePreview(text, html);
  const size = new TextEncoder().encode(text + html).length;
  const code = settings.code_extract.enabled ? extractCodeByRegex(req.subject, text) : '';

  const sendChannel = hasExternal ? 'cloudflare' : 'internal';

  // outbound 行先落库（status 占位）：拿到 id 后持久化附件，再决定外发正文/附件。
  // 外发超大附件需转为下载链接注入正文，而链接要附件 id、附件 id 要 message id。
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
      inReplyTo,
      status: hasExternal ? 'sent' : 'delivered',
      sendChannel,
      errorDetail: '',
      isRead: true,
      size,
      createdAt: new Date(),
    })
    .returning()
    .get();
  // 附件持久化到 outbound 行（发件人「已发送」可见、可下载）
  const outboundAtts = await persistAttachments(env, db, outbound!.id, attachments);

  let status = hasExternal ? 'sent' : 'delivered';
  let errorDetail = '';
  let bodyText = text;
  let bodyHtml = html;
  if (hasExternal) {
    // 外发日配额（普通用户）：发送前校验，防被盗账号脚本化群发
    await assertOutboundQuota(env, settings.quota, sender, externalTargets.length);
    // 外发负载：正文+附件 ≤ 5MiB 直发附件；超限则附件转下载链接注入正文，MIME 不带附件
    const payload = await buildExternalPayload(env, origin, text, html, attachments, outboundAtts);
    const failures: string[] = [];
    for (const addr of externalTargets) {
      try {
        await sendViaCloudflare(env, from, addr, req, payload.atts, reply, payload.text, payload.html);
      } catch (cfErr) {
        const cfMsg = cfErr instanceof Error ? cfErr.message : String(cfErr);
        failures.push(`${addr}: ${cfMsg}`);
      }
    }
    if (failures.length === externalTargets.length) {
      status = 'failed';
      errorDetail = failures.join('; ');
    } else if (failures.length) {
      status = 'sent';
      errorDetail = `部分收件人失败: ${failures.join('; ')}`;
    }
    // 外发实际正文（可能含链接）回填，让发件人「已发送」看到真实发出内容
    bodyText = payload.text;
    bodyHtml = payload.html;
  }

  // 至少部分送达才计入配额（全失败不烧信誉，不计数）
  if (hasExternal && status !== 'failed') {
    await bumpOutboundQuota(env, sender, externalTargets.length);
  }

  // 回填 outbound 状态与（外发）正文
  await db.update(messages).set({ status, errorDetail, bodyText, bodyHtml }).where(eq(messages.id, outbound!.id));

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
        // BCC 名单不写入收件方记录：密送收件人的副本不应暴露其他被密送者
        recipients: { to: req.to, cc: req.cc, bcc: [] },
        subject: req.subject,
        preview,
        bodyText: text,
        bodyHtml: html,
        verificationCode: code,
        inReplyTo,
        status: 'received',
        sendChannel: 'internal',
        isRead: false,
        size,
        createdAt: new Date(),
      })
      .returning({ id: messages.id })
      .get();
    internalRows.push(inbound!.id);
    await persistAttachments(env, db, inbound!.id, attachments);
  }

  // 站内互投通知（异步）：按每个收件地址所属用户的个人偏好推送飞书 + 通用 webhook
  if (internalTargets.length) {
    ctx.waitUntil(
      (async () => {
        for (let i = 0; i < internalTargets.length; i++) {
          const target = internalTargets[i]!;
          const messageId = internalRows[i]!;
          const ownerId = await getMailboxOwner(env, target);
          const ownerIds = ownerId !== null ? [ownerId] : await getActiveAdminIds(env);
          for (const id of ownerIds) {
            const prefs = await getUserNotifyPrefs(env, id);
            try {
              await sendFeishuNotification(prefs.feishu, {
                subject: req.subject,
                fromAddress: from.address,
                fromName: from.displayName,
                toAddress: target,
                code,
                body: text || html,
              });
            } catch (e) {
              console.error('站内互投飞书通知失败:', e);
            }
            try {
              await sendNotifyWebhook(prefs.webhook, {
                event: 'mail.received',
                message: {
                  id: messageId,
                  address: target,
                  fromAddress: from.address,
                  fromName: from.displayName,
                  subject: req.subject,
                  verificationCode: code,
                  preview,
                  createdAt: new Date().toISOString(),
                },
              });
            } catch (e) {
              console.error('站内互投通用 webhook 失败:', e);
            }
          }
        }
      })(),
    );
  }

  return summarize({ ...outbound!, status, errorDetail }, attachments.length > 0, false);
}
