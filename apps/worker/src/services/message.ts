import type {
  ListMessagesQuery,
  MessageDetail,
  MessageRecipients,
  MessageSummary,
  Page,
  Role,
} from '@hpc-mail/shared';
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { createDb, type Db } from '../db/client.js';
import { attachments as attachmentsTable, messages, stars } from '../db/schema.js';
import { signAttachment } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { decodeCursor, encodeCursor } from '../lib/pagination.js';
import type { Env } from '../types.js';
import { userAddresses } from './mailbox.js';
import { deleteMessageObjects, getJson } from './storage.js';

export interface Viewer {
  userId: number;
  role: Role;
  scope?: 'mine' | 'all';
}

type MessageRow = typeof messages.$inferSelect;

/** 解析可见范围：admin 默认全站，scope=mine 或 user → 自己认领地址 */
async function resolveScope(env: Env, viewer: Viewer): Promise<'all' | string[]> {
  if (viewer.role === 'admin' && viewer.scope !== 'mine') return 'all';
  return userAddresses(env, viewer.userId);
}

/**
 * 变更类操作（标记/星标/删除）的可见范围：与只读相反，admin 必须**显式** scope='all'
 * 才作用全站，否则默认只作用自己认领地址——防止 API 调用方漏传 scope 误删/误改他人邮件。
 */
async function resolveMutationScope(env: Env, viewer: Viewer): Promise<'all' | string[]> {
  if (viewer.role === 'admin' && viewer.scope === 'all') return 'all';
  return userAddresses(env, viewer.userId);
}

function scopeCondition(scope: 'all' | string[]): SQL | undefined {
  if (scope === 'all') return undefined;
  if (scope.length === 0) return eq(messages.id, -1); // 匹配空集
  return inArray(messages.address, scope);
}

function summarize(row: MessageRow, hasAttachments: boolean, isStarred: boolean): MessageSummary {
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

async function attachmentFlags(db: Db, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ messageId: attachmentsTable.messageId })
    .from(attachmentsTable)
    .where(inArray(attachmentsTable.messageId, ids))
    .all();
  return new Set(rows.map((r) => r.messageId));
}

/** 当前用户对给定邮件集合的星标标记 */
async function starFlags(db: Db, userId: number, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ messageId: stars.messageId })
    .from(stars)
    .where(and(eq(stars.userId, userId), inArray(stars.messageId, ids)))
    .all();
  return new Set(rows.map((r) => r.messageId));
}

export async function listMessages(
  env: Env,
  viewer: Viewer,
  query: ListMessagesQuery,
): Promise<Page<MessageSummary>> {
  const db = createDb(env);
  const scope = await resolveScope(env, viewer);

  const conds: (SQL | undefined)[] = [scopeCondition(scope)];
  // 回收站视图看软删除的，普通视图排除软删除的
  conds.push(query.trash ? isNotNull(messages.deletedAt) : isNull(messages.deletedAt));
  if (query.direction) conds.push(eq(messages.direction, query.direction));
  if (query.domain) conds.push(eq(messages.domain, query.domain));
  if (query.address) conds.push(eq(messages.address, query.address));
  if (query.unread) conds.push(eq(messages.isRead, false));
  if (query.starred) {
    conds.push(
      inArray(
        messages.id,
        db.select({ id: stars.messageId }).from(stars).where(eq(stars.userId, viewer.userId)),
      ),
    );
  }
  if (query.q) {
    // 转义 LIKE 通配符（% _ \），否则用户搜 "50%" 会变成任意匹配；配 ESCAPE 子句生效
    const escaped = query.q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const term = `%${escaped}%`;
    conds.push(
      or(
        sql`${messages.subject} LIKE ${term} ESCAPE '\\'`,
        sql`${messages.fromAddress} LIKE ${term} ESCAPE '\\'`,
        sql`${messages.fromName} LIKE ${term} ESCAPE '\\'`,
        sql`${messages.bodyText} LIKE ${term} ESCAPE '\\'`,
        // recipients 存的是 JSON 文本，对其 LIKE 即可按收件人搜索（已发送找「发给谁」）
        sql`${messages.recipients} LIKE ${term} ESCAPE '\\'`,
      ),
    );
  }
  const cursorId = decodeCursor(query.cursor);
  if (cursorId) conds.push(lt(messages.id, cursorId));
  if (query.afterId) conds.push(gt(messages.id, query.afterId));

  const where = and(...conds.filter((x): x is SQL => x !== undefined));
  const rows = await db
    .select()
    .from(messages)
    .where(where)
    .orderBy(desc(messages.id))
    .limit(query.limit + 1)
    .all();

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const ids = page.map((r) => r.id);
  const [attSet, starSet] = await Promise.all([
    attachmentFlags(db, ids),
    starFlags(db, viewer.userId, ids),
  ]);

  return {
    items: page.map((r) => summarize(r, attSet.has(r.id), starSet.has(r.id))),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]!.id) : null,
  };
}

/**
 * 收件箱未读数：口径同 /inbox（scope=mine + inbound + 未读），一条 COUNT 查询。
 * 复用 listMessages 的可见性逻辑（resolveScope/scopeCondition），避免条件漂移；
 * admin 也按 scope=mine 只数自己认领地址（个人角标，非全站）。
 */
export async function countUnread(env: Env, userId: number, role: Role): Promise<number> {
  const db = createDb(env);
  const scope = await resolveScope(env, { userId, role, scope: 'mine' });
  const row = await db
    .select({ value: count() })
    .from(messages)
    .where(
      and(
        scopeCondition(scope),
        eq(messages.direction, 'inbound'),
        eq(messages.isRead, false),
        isNull(messages.deletedAt),
      ),
    )
    .get();
  return row?.value ?? 0;
}

/** 近期联系人：从可见邮件聚合收件人(outbound)与发件人(inbound)地址，供写信自动补全 */
export async function getRecentContacts(env: Env, viewer: Viewer, limit = 100): Promise<string[]> {
  const db = createDb(env);
  const scope = await resolveScope(env, viewer);
  const rows = await db
    .select({
      direction: messages.direction,
      recipients: messages.recipients,
      fromAddress: messages.fromAddress,
    })
    .from(messages)
    .where(and(scopeCondition(scope), isNull(messages.deletedAt)))
    .orderBy(desc(messages.id))
    .limit(400)
    .all();
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.direction === 'outbound') {
      for (const addr of [...(r.recipients?.to ?? []), ...(r.recipients?.cc ?? [])]) {
        if (addr) seen.add(addr);
      }
    } else if (r.fromAddress) {
      seen.add(r.fromAddress);
    }
    if (seen.size >= limit) break;
  }
  return [...seen].slice(0, limit);
}

/** 归一化主题：剥离 Re:/Fwd:/回复:/转发: 前缀，用于会话归组 */
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^\s*((re|fwd?|回复|转发)\s*[:：]\s*)+/i, '')
    .trim()
    .toLowerCase();
}

/** 会话线程：同一归一化主题、可见范围内的邮件，按时间正序 */
export async function getThread(env: Env, viewer: Viewer, id: number): Promise<MessageSummary[]> {
  const db = createDb(env);
  const target = await loadVisible(env, viewer, id);
  const core = normalizeSubject(target.subject);
  const summarizeRows = async (rows: MessageRow[]) => {
    const ids = rows.map((r) => r.id);
    const [attSet, starSet] = await Promise.all([
      attachmentFlags(db, ids),
      starFlags(db, viewer.userId, ids),
    ]);
    return rows.map((r) => summarize(r, attSet.has(r.id), starSet.has(r.id)));
  };
  if (!core) return summarizeRows([target]);

  const scope = await resolveScope(env, viewer);
  const escaped = core.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        scopeCondition(scope),
        isNull(messages.deletedAt),
        sql`${messages.subject} LIKE ${`%${escaped}%`} ESCAPE '\\'`,
      ),
    )
    .orderBy(asc(messages.id))
    .limit(100)
    .all();
  const thread = rows.filter((r) => normalizeSubject(r.subject) === core);
  return summarizeRows(thread.length ? thread : [target]);
}

async function loadVisible(env: Env, viewer: Viewer, id: number): Promise<MessageRow> {
  const db = createDb(env);
  const row = await db.select().from(messages).where(eq(messages.id, id)).get();
  if (!row) throw new AppError('not_found', '邮件不存在');
  const scope = await resolveScope(env, viewer);
  if (scope !== 'all' && !scope.includes(row.address)) {
    throw new AppError('not_found', '邮件不存在');
  }
  return row;
}

function rewriteCidUrls(
  html: string,
  atts: { contentId: string; url: string }[],
): string {
  let result = html;
  for (const att of atts) {
    if (!att.contentId) continue;
    const escaped = att.contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`cid:${escaped}`, 'gi'), att.url);
  }
  return result;
}

export async function getMessageDetail(
  env: Env,
  viewer: Viewer,
  id: number,
): Promise<MessageDetail> {
  const db = createDb(env);
  const row = await loadVisible(env, viewer, id);

  let bodyText = row.bodyText;
  let bodyHtml = row.bodyHtml;
  if (row.bodyR2Key) {
    const full = await getJson<{ text?: string; html?: string }>(env, row.bodyR2Key);
    if (full) {
      bodyText = full.text ?? bodyText;
      bodyHtml = full.html ?? bodyHtml;
    }
  }

  const [attRows, starSet] = await Promise.all([
    db.select().from(attachmentsTable).where(eq(attachmentsTable.messageId, id)).all(),
    starFlags(db, viewer.userId, [id]),
  ]);

  const attachmentMetas = await Promise.all(
    attRows.map(async (a) => {
      const { exp, sig } = await signAttachment(env.jwt_secret, a.id);
      return {
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        contentId: a.contentId,
        disposition: a.disposition,
        url: `/api/attachments/${a.id}?exp=${exp}&sig=${sig}`,
      };
    }),
  );

  bodyHtml = rewriteCidUrls(
    bodyHtml,
    attachmentMetas.map((a) => ({ contentId: a.contentId, url: a.url })),
  );

  return {
    ...summarize(row, attRows.length > 0, starSet.has(id)),
    recipients: row.recipients as MessageRecipients,
    bodyText,
    bodyHtml,
    attachments: attachmentMetas,
    hasRaw: !!row.rawR2Key,
  };
}

/** 取原始 .eml R2 对象（校验可见性）；无存档返回 null */
export async function getRawMessageObject(
  env: Env,
  viewer: Viewer,
  id: number,
): Promise<R2ObjectBody | null> {
  const row = await loadVisible(env, viewer, id);
  if (!row.rawR2Key) return null;
  return env.r2.get(row.rawR2Key);
}

/** 加载单条附件（校验可见性由调用方决定：签名 URL 或 JWT） */
export async function loadAttachmentForViewer(
  env: Env,
  viewer: Viewer,
  attId: number,
): Promise<typeof attachmentsTable.$inferSelect> {
  const db = createDb(env);
  const att = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, attId)).get();
  if (!att) throw new AppError('not_found', '附件不存在');
  await loadVisible(env, viewer, att.messageId);
  return att;
}

export async function loadAttachmentById(
  env: Env,
  attId: number,
): Promise<typeof attachmentsTable.$inferSelect> {
  const db = createDb(env);
  const att = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, attId)).get();
  if (!att) throw new AppError('not_found', '附件不存在');
  return att;
}

/** 批量已读/未读（按可见范围过滤） */
export async function markMessages(
  env: Env,
  viewer: Viewer,
  ids: number[],
  isRead: boolean,
): Promise<number> {
  const db = createDb(env);
  const scope = await resolveMutationScope(env, viewer);
  const cond =
    scope === 'all'
      ? inArray(messages.id, ids)
      : and(inArray(messages.id, ids), scopeCondition(scope));
  const result = await db.update(messages).set({ isRead }).where(cond).run();
  return result.meta.changes ?? 0;
}

/** 批量星标/取消（每用户独立；限可见范围） */
export async function starMessages(
  env: Env,
  viewer: Viewer,
  ids: number[],
  starred: boolean,
): Promise<number> {
  const db = createDb(env);
  // 星标是个人标记（独立 stars 表，不影响他人），用只读可见范围即可
  const scope = await resolveScope(env, viewer);
  const cond =
    scope === 'all'
      ? inArray(messages.id, ids)
      : and(inArray(messages.id, ids), scopeCondition(scope));
  const visible = await db.select({ id: messages.id }).from(messages).where(cond).all();
  const visibleIds = visible.map((v) => v.id);
  if (visibleIds.length === 0) return 0;

  if (starred) {
    await db
      .insert(stars)
      .values(visibleIds.map((id) => ({ userId: viewer.userId, messageId: id })))
      .onConflictDoNothing();
  } else {
    await db
      .delete(stars)
      .where(and(eq(stars.userId, viewer.userId), inArray(stars.messageId, visibleIds)));
  }
  return visibleIds.length;
}

function scopedIdsCondition(scope: 'all' | string[], ids: number[]): SQL {
  return scope === 'all'
    ? inArray(messages.id, ids)
    : (and(inArray(messages.id, ids), scopeCondition(scope)) as SQL);
}

/** 批量软删除（移入回收站）：仅置 deletedAt，7 天后由 scheduled 硬删 */
export async function deleteMessages(env: Env, viewer: Viewer, ids: number[]): Promise<number> {
  const db = createDb(env);
  const scope = await resolveMutationScope(env, viewer);
  const cond = and(scopedIdsCondition(scope, ids), isNull(messages.deletedAt)) as SQL;
  const result = await db.update(messages).set({ deletedAt: new Date() }).where(cond).run();
  return result.meta.changes ?? 0;
}

/** 从回收站恢复：清空 deletedAt */
export async function restoreMessages(env: Env, viewer: Viewer, ids: number[]): Promise<number> {
  const db = createDb(env);
  const scope = await resolveMutationScope(env, viewer);
  const cond = and(scopedIdsCondition(scope, ids), isNotNull(messages.deletedAt)) as SQL;
  const result = await db.update(messages).set({ deletedAt: null }).where(cond).run();
  return result.meta.changes ?? 0;
}

/** 永久删除（可见范围内）：D1 行删 + R2 清理（正文/附件/原始 .eml） */
export async function purgeMessages(env: Env, viewer: Viewer, ids: number[]): Promise<number> {
  const db = createDb(env);
  const scope = await resolveMutationScope(env, viewer);
  const targets = await db
    .select({ id: messages.id, bodyR2Key: messages.bodyR2Key, rawR2Key: messages.rawR2Key })
    .from(messages)
    .where(scopedIdsCondition(scope, ids))
    .all();
  if (targets.length === 0) return 0;
  const targetIds = targets.map((t) => t.id);
  await db.delete(attachmentsTable).where(inArray(attachmentsTable.messageId, targetIds));
  await db.delete(stars).where(inArray(stars.messageId, targetIds));
  await db.delete(messages).where(inArray(messages.id, targetIds));
  for (const t of targets) {
    await deleteMessageObjects(env, t.id, t.bodyR2Key);
    if (t.rawR2Key) {
      try {
        await env.r2.delete(t.rawR2Key);
      } catch (e) {
        console.error('删除原始邮件对象失败:', e);
      }
    }
  }
  return targetIds.length;
}
