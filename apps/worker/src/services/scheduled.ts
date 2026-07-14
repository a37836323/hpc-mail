import { lt } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { apiRateLimits, apiRequestLogs } from '../db/schema.js';
import type { Env } from '../types.js';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** 每日清理：审计日志滚动 90 天 + 过期限流窗口 */
export async function runScheduled(env: Env): Promise<void> {
  const db = createDb(env);
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
  const staleWindow = Math.floor(Date.now() / 60000) - 120;
  try {
    await db.delete(apiRequestLogs).where(lt(apiRequestLogs.createdAt, cutoff));
    await db.delete(apiRateLimits).where(lt(apiRateLimits.windowStart, staleWindow));
  } catch (e) {
    console.error('定时清理失败:', e);
  }
}
