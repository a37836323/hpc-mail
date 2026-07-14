import { claimMailboxRequestSchema, updateMailboxRequestSchema } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { AppError } from '../lib/errors.js';
import { ok, parseBody, parseId } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import {
  checkAvailability,
  claimMailbox,
  listMailboxes,
  releaseMailbox,
  updateMailbox,
} from '../services/mailbox.js';
import type { AppContext } from '../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth);

/** admin ?all=1 看全站；否则看自己认领的 */
app.get('/', async (c) => {
  const user = c.get('user')!;
  const all = c.req.query('all') === '1' && user.role === 'admin';
  const list = await listMailboxes(c.env, all ? { all: true } : { userId: user.id });
  return ok(c, list);
});

app.get('/availability', async (c) => {
  const localPart = (c.req.query('localPart') || '').trim().toLowerCase();
  const domain = (c.req.query('domain') || '').trim().toLowerCase();
  if (!localPart || !domain) throw new AppError('validation_failed', '缺少 localPart 或 domain');
  return ok(c, await checkAvailability(c.env, localPart, domain));
});

app.post('/', async (c) => {
  const user = c.get('user')!;
  const req = await parseBody(c, claimMailboxRequestSchema);
  return ok(c, await claimMailbox(c.env, user.id, req), 201);
});

app.put('/:id', async (c) => {
  const user = c.get('user')!;
  const id = parseId(c.req.param('id'));
  const req = await parseBody(c, updateMailboxRequestSchema);
  return ok(c, await updateMailbox(c.env, user.id, id, req.displayName, user.role === 'admin'));
});

app.delete('/:id', async (c) => {
  const user = c.get('user')!;
  const id = parseId(c.req.param('id'));
  await releaseMailbox(c.env, user.id, id, user.role === 'admin');
  return ok(c, { success: true });
});

export default app;
