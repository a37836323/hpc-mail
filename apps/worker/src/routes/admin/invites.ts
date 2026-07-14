import { createInviteRequestSchema } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { ok, parseBody, parseId } from '../../lib/http.js';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import { createInvites, listInvites, revokeInvite } from '../../services/invite.js';
import type { AppContext } from '../../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth, requireAdmin);

app.get('/', async (c) => ok(c, await listInvites(c.env)));

app.post('/', async (c) => {
  const acting = c.get('user')!;
  const req = await parseBody(c, createInviteRequestSchema);
  return ok(c, await createInvites(c.env, acting.id, req), 201);
});

app.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  await revokeInvite(c.env, id);
  return ok(c, { success: true });
});

export default app;
