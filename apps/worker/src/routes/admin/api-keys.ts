import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { clientIp, ok, parseId } from '../../lib/http.js';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import { getApiKey, listApiKeyLogs, listApiKeys, revokeApiKey } from '../../services/api-key.js';
import { logAdminAction } from '../../services/audit.js';
import type { AppContext } from '../../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth, requireAdmin);

/** 全站 key 列表（含 ownerUsername） */
app.get('/', async (c) => ok(c, await listApiKeys(c.env)));

app.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  return ok(c, await getApiKey(c.env, id));
});

/** 审计日志分页 */
app.get('/:id/logs', async (c) => {
  const id = parseId(c.req.param('id'));
  const cursor = c.req.query('cursor');
  const limitRaw = Number(c.req.query('limit'));
  const limit = Number.isInteger(limitRaw)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, limitRaw))
    : DEFAULT_PAGE_SIZE;
  return ok(c, await listApiKeyLogs(c.env, id, cursor, limit));
});

/** admin 吊销任意 key */
app.delete('/:id', async (c) => {
  const acting = c.get('user')!;
  const id = parseId(c.req.param('id'));
  await revokeApiKey(c.env, id);
  await logAdminAction(c.env, acting, 'apikey.revoke', `key#${id}`, '', clientIp(c));
  return ok(c, { success: true });
});

export default app;
