import { and, eq, inArray, lt, notInArray, type SQL } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import {
  apiRateLimits,
  apiRequestLogs,
  attachments as attachmentsTable,
  mailboxes,
  messages,
  stars,
} from '../db/schema.js';
import type { Env } from '../types.js';
import { getSettings } from './setting.js';
import { deleteMessageObjects } from './storage.js';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 单次清理批量上限，防止单次 cron 运行过久（下一次继续清剩余） */
const RETENTION_BATCH = 1000;

/** 按 where 条件删除邮件（D1 行 + R2 对象），返回删除条数；限批量 */
async function purgeMessagesWhere(env: Env, cond: SQL): Promise<number> {
  const db = createDb(env);
  const targets = await db
    .select({ id: messages.id, bodyR2Key: messages.bodyR2Key })
    .from(messages)
    .where(cond)
    .limit(RETENTION_BATCH)
    .all();
  if (targets.length === 0) return 0;
  const ids = targets.map((t) => t.id);
  await db.delete(attachmentsTable).where(inArray(attachmentsTable.messageId, ids));
  await db.delete(stars).where(inArray(stars.messageId, ids));
  await db.delete(messages).where(inArray(messages.id, ids));
  for (const t of targets) {
    await deleteMessageObjects(env, t.id, t.bodyR2Key);
  }
  return ids.length;
}

/** 邮件保留清理：未认领地址 + 全局上限；各自独立 try/catch 互不影响 */
async function runRetention(env: Env): Promise<void> {
  const settings = await getSettings(env);
  const { unclaimedDays, allMessagesDays } = settings.retention;
  const db = createDb(env);

  if (unclaimedDays > 0) {
    try {
      const cutoff = new Date(Date.now() - unclaimedDays * DAY_MS);
      // 未被任何用户认领的地址收到的 inbound 邮件（catch-all 垃圾的主要来源）
      const claimed = db.select({ address: mailboxes.address }).from(mailboxes);
      const n = await purgeMessagesWhere(
        env,
        and(
          eq(messages.direction, 'inbound'),
          lt(messages.createdAt, cutoff),
          notInArray(messages.address, claimed),
        )!,
      );
      if (n > 0) console.log(`保留清理：删除未认领地址邮件 ${n} 封`);
    } catch (e) {
      console.error('未认领地址保留清理失败:', e);
    }
  }

  if (allMessagesDays > 0) {
    try {
      const cutoff = new Date(Date.now() - allMessagesDays * DAY_MS);
      const n = await purgeMessagesWhere(env, lt(messages.createdAt, cutoff));
      if (n > 0) console.log(`保留清理：删除超期邮件 ${n} 封`);
    } catch (e) {
      console.error('全局保留清理失败:', e);
    }
  }
}

/** 每日清理：审计日志 90 天 + 过期限流窗口 + 邮件保留策略 */
export async function runScheduled(env: Env): Promise<void> {
  const db = createDb(env);
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
  const staleWindow = Math.floor(Date.now() / 60000) - 120;

  try {
    await db.delete(apiRequestLogs).where(lt(apiRequestLogs.createdAt, cutoff));
  } catch (e) {
    console.error('审计日志清理失败:', e);
  }
  try {
    await db.delete(apiRateLimits).where(lt(apiRateLimits.windowStart, staleWindow));
  } catch (e) {
    console.error('限流窗口清理失败:', e);
  }
  try {
    await runRetention(env);
  } catch (e) {
    console.error('邮件保留清理失败:', e);
  }
}
