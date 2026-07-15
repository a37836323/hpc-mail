import type {
  ListMessagesQuery,
  MessageDetail,
  MessageRecipients,
  MessageSummary,
  Page,
  Role,
} from '@hpc-mail/shared';
import { and, count, desc, eq, inArray, like, lt, or, type SQL } from 'drizzle-orm';
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
    const term = `%${query.q}%`;
    conds.push(
      or(
        like(messages.subject, term),
        like(messages.fromAddress, term),
        like(messages.bodyText, term),
      ),
    );
  }
  const cursorId = decodeCursor(query.cursor);
  if (cursorId) conds.push(lt(messages.id, cursorId));

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
      and(scopeCondition(scope), eq(messages.direction, 'inbound'), eq(messages.isRead, false)),
    )
    .get();
  return row?.value ?? 0;
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
  };
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
  const scope = await resolveScope(env, viewer);
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

/** 批量删除（可见范围内）：D1 行删 + R2 清理 */
export async function deleteMessages(env: Env, viewer: Viewer, ids: number[]): Promise<number> {
  const db = createDb(env);
  const scope = await resolveScope(env, viewer);
  const cond =
    scope === 'all'
      ? inArray(messages.id, ids)
      : and(inArray(messages.id, ids), scopeCondition(scope));
  const targets = await db
    .select({ id: messages.id, bodyR2Key: messages.bodyR2Key })
    .from(messages)
    .where(cond)
    .all();
  if (targets.length === 0) return 0;
  const targetIds = targets.map((t) => t.id);
  await db.delete(attachmentsTable).where(inArray(attachmentsTable.messageId, targetIds));
  await db.delete(stars).where(inArray(stars.messageId, targetIds));
  await db.delete(messages).where(inArray(messages.id, targetIds));
  for (const t of targets) {
    await deleteMessageObjects(env, t.id, t.bodyR2Key);
  }
  return targetIds.length;
}
