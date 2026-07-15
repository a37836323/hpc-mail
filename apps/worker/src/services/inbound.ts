import PostalMime from 'postal-mime';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { attachments as attachmentsTable, messages } from '../db/schema.js';
import { getEmailDomain, getNameFromEmail, normalizeEmail } from '../lib/email-address.js';
import { htmlToText, makePreview } from '../lib/text.js';
import type { Env, ExecCtx } from '../types.js';
import { extractCodeByAi, extractCodeByRegex } from './code-extract.js';
import { sendFeishuNotification } from './feishu.js';
import { getSettings } from './setting.js';
import { attachmentKey, bodyKey, getExt, putJson, putObject, sha256Hex16 } from './storage.js';

const D1_BODY_LIMIT = 256 * 1024;
const TRUNCATE_CHARS = 64 * 1024;
const encoder = new TextEncoder();

function byteLen(s: string): number {
  return encoder.encode(s).length;
}

interface ParsedAttachment {
  seq: number;
  content: Uint8Array;
  filename: string;
  mimeType: string;
  contentId: string;
  disposition: string;
  size: number;
}

/**
 * 收件链路：解析 → 提码 → 正文分层/附件落 R2 → 落库 → 同步 Gmail 转发
 * → waitUntil(AI 兜底 + 飞书)。仅落库失败 throw（触发 SMTP 重试）。
 */
export async function handleInbound(
  message: ForwardableEmailMessage,
  env: Env,
  ctx: ExecCtx,
): Promise<void> {
  const settings = await getSettings(env);

  const email = await PostalMime.parse(message.raw);

  const toAddress = normalizeEmail(message.to);
  const domain = getEmailDomain(toAddress);
  const fromAddress = normalizeEmail(email.from?.address);
  const fromName = (email.from?.name || getNameFromEmail(fromAddress)).trim();

  const mapAddrs = (list: { address?: string }[] | undefined): string[] =>
    (list ?? []).map((x) => normalizeEmail(x.address)).filter(Boolean);
  const toList = mapAddrs(email.to);
  const recipients = {
    to: toList.length ? toList : [toAddress],
    cc: mapAddrs(email.cc),
    bcc: mapAddrs(email.bcc),
  };

  const subject = email.subject || '';
  const text = email.text || '';
  const html = email.html || '';

  // 同步正则提码
  let code = '';
  if (settings.code_extract.enabled) {
    code = extractCodeByRegex(subject, text || htmlToText(html));
  }

  // 附件落 R2 前先算内容
  const parsedAttachments: ParsedAttachment[] = (email.attachments ?? []).map((att, seq) => {
    const raw = att.content as string | ArrayBuffer;
    const content = typeof raw === 'string' ? encoder.encode(raw) : new Uint8Array(raw);
    return {
      seq,
      content,
      filename: att.filename || 'download',
      mimeType: att.mimeType || 'application/octet-stream',
      contentId: (att.contentId || '').replace(/^<|>$/g, ''),
      disposition: att.disposition === 'inline' ? 'inline' : 'attachment',
      size: content.byteLength,
    };
  });
  const attachmentsSize = parsedAttachments.reduce((sum, a) => sum + a.size, 0);

  // 正文分层：>256KB 存 64KB 截断 + 完整 JSON 落 R2
  let bodyText = text;
  let bodyHtml = html;
  let bodyR2Key: string | null = null;
  if (byteLen(text) + byteLen(html) > D1_BODY_LIMIT) {
    const key = bodyKey();
    try {
      await putJson(env, key, { text, html });
      bodyR2Key = key;
    } catch (e) {
      console.error('正文溢出落 R2 失败，降级仅存截断:', e);
    }
    bodyText = text.slice(0, TRUNCATE_CHARS);
    bodyHtml = html.slice(0, TRUNCATE_CHARS);
  }

  const preview = makePreview(text, html);
  const size = byteLen(text) + byteLen(html) + attachmentsSize;

  const db = createDb(env);
  // 消息落库：失败向上抛出触发 SMTP 重试
  const inserted = await db
    .insert(messages)
    .values({
      direction: 'inbound',
      address: toAddress,
      domain,
      fromAddress,
      fromName,
      recipients,
      subject,
      preview,
      bodyText,
      bodyHtml,
      bodyR2Key,
      verificationCode: code,
      messageId: email.messageId ?? null,
      inReplyTo: email.inReplyTo ?? null,
      status: 'received',
      isRead: false,
      size,
      createdAt: new Date(),
    })
    .returning({ id: messages.id })
    .get();
  const messageId = inserted!.id;

  // 附件上传 + 落库（best-effort，不阻断收件成功）
  if (parsedAttachments.length) {
    try {
      const rows = [];
      for (const att of parsedAttachments) {
        const hash16 = await sha256Hex16(att.content);
        const key = attachmentKey(messageId, att.seq, hash16, getExt(att.filename));
        await putObject(env, key, att.content, att.mimeType);
        rows.push({
          messageId,
          r2Key: key,
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size,
          contentId: att.contentId,
          disposition: att.disposition,
        });
      }
      await db.insert(attachmentsTable).values(rows);
    } catch (e) {
      console.error('附件入库失败:', e);
    }
  }

  // 同步 Gmail 转发（逐地址 try/catch 隔离）
  if (settings.gmail_forward.enabled && settings.gmail_forward.addresses.length) {
    for (const target of settings.gmail_forward.addresses) {
      try {
        await message.forward(target);
      } catch (e) {
        console.error(`Gmail 转发到 ${target} 失败:`, e);
      }
    }
  }

  // 异步后处理：AI 兜底提码 + 飞书通知
  ctx.waitUntil(
    (async () => {
      let finalCode = code;
      if (!finalCode && settings.code_extract.enabled && settings.code_extract.aiEnabled) {
        try {
          const aiCode = await extractCodeByAi(env, { subject, text, html });
          if (aiCode) {
            finalCode = aiCode;
            await db
              .update(messages)
              .set({ verificationCode: aiCode })
              .where(eq(messages.id, messageId));
          }
        } catch (e) {
          console.error('AI 提码失败:', e);
        }
      }
      try {
        await sendFeishuNotification(env, settings, {
          subject,
          fromAddress,
          fromName,
          toAddress,
          code: finalCode,
          body: text || htmlToText(html),
        });
      } catch (e) {
        console.error('飞书通知失败:', e);
      }
    })(),
  );
}
