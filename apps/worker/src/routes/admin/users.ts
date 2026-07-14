import { createUserRequestSchema, updateUserRequestSchema } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { ok, parseBody, parseId } from '../../lib/http.js';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import { createUser, deleteUser, listUsers, updateUser } from '../../services/user.js';
import type { AppContext } from '../../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth, requireAdmin);

app.get('/', async (c) => ok(c, await listUsers(c.env)));

app.post('/', async (c) => {
  const req = await parseBody(c, createUserRequestSchema);
  return ok(c, await createUser(c.env, req), 201);
});

app.put('/:id', async (c) => {
  const acting = c.get('user')!;
  const id = parseId(c.req.param('id'));
  const req = await parseBody(c, updateUserRequestSchema);
  return ok(c, await updateUser(c.env, acting.id, id, req));
});

app.delete('/:id', async (c) => {
  const acting = c.get('user')!;
  const id = parseId(c.req.param('id'));
  await deleteUser(c.env, acting.id, id);
  return ok(c, { success: true });
});

export default app;
