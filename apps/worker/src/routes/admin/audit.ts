import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { ok } from '../../lib/http.js';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import { listAdminAuditLogs } from '../../services/audit.js';
import type { AppContext } from '../../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth, requireAdmin);

/** 管理操作审计日志（游标分页，倒序） */
app.get('/', async (c) => {
  const cursor = c.req.query('cursor');
  const limitRaw = Number(c.req.query('limit'));
  const limit = Number.isInteger(limitRaw)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, limitRaw))
    : DEFAULT_PAGE_SIZE;
  return ok(c, await listAdminAuditLogs(c.env, cursor, limit));
});

export default app;
