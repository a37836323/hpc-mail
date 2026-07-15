import type { AdminAuditLogEntry, Page } from '@hpc-mail/shared';
import { desc, lt } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { adminAuditLogs } from '../db/schema.js';
import { decodeCursor, encodeCursor } from '../lib/pagination.js';
import type { AuthUser, Env } from '../types.js';

/** 记录一条管理操作（best-effort，写失败不阻断主流程） */
export async function logAdminAction(
  env: Env,
  actor: Pick<AuthUser, 'id' | 'username'>,
  action: string,
  target = '',
  detail = '',
  ip = '',
): Promise<void> {
  try {
    await createDb(env)
      .insert(adminAuditLogs)
      .values({ actorId: actor.id, actorName: actor.username, action, target, detail, ip });
  } catch (e) {
    console.error('管理审计日志写入失败:', e);
  }
}

export async function listAdminAuditLogs(
  env: Env,
  cursor: string | undefined,
  limit: number,
): Promise<Page<AdminAuditLogEntry>> {
  const db = createDb(env);
  const cursorId = decodeCursor(cursor);
  const rows = await db
    .select()
    .from(adminAuditLogs)
    .where(cursorId ? lt(adminAuditLogs.id, cursorId) : undefined)
    .orderBy(desc(adminAuditLogs.id))
    .limit(limit + 1)
    .all();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map((r) => ({
      id: r.id,
      actorName: r.actorName,
      action: r.action,
      target: r.target,
      detail: r.detail,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]!.id) : null,
  };
}
