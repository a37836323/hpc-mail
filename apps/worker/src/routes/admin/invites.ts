import { createInviteRequestSchema } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { clientIp, ok, parseBody, parseId } from '../../lib/http.js';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import { logAdminAction } from '../../services/audit.js';
import { createInvites, listInvites, revokeInvite } from '../../services/invite.js';
import type { AppContext } from '../../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth, requireAdmin);

app.get('/', async (c) => ok(c, await listInvites(c.env)));

app.post('/', async (c) => {
  const acting = c.get('user')!;
  const req = await parseBody(c, createInviteRequestSchema);
  const created = await createInvites(c.env, acting.id, req);
  await logAdminAction(c.env, acting, 'invite.create', `${created.length} 个`, req.note, clientIp(c));
  return ok(c, created, 201);
});

app.delete('/:id', async (c) => {
  const acting = c.get('user')!;
  const id = parseId(c.req.param('id'));
  await revokeInvite(c.env, id);
  await logAdminAction(c.env, acting, 'invite.revoke', `invite#${id}`, '', clientIp(c));
  return ok(c, { success: true });
});

export default app;
