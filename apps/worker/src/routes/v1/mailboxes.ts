import { claimMailboxRequestSchema } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { ok, parseBody } from '../../lib/http.js';
import { apiKeyAuth, requireScope } from '../../middleware/api-key-auth.js';
import { claimMailbox, listMailboxes } from '../../services/mailbox.js';
import type { AppContext } from '../../types.js';

const app = new Hono<AppContext>();
app.use('*', apiKeyAuth);

app.get('/', async (c) => {
  requireScope(c, 'mailbox.read');
  const key = c.get('apiKey')!;
  const list =
    key.role === 'admin'
      ? await listMailboxes(c.env, { all: true })
      : await listMailboxes(c.env, { userId: key.userId });
  return ok(c, list);
});

app.post('/', async (c) => {
  requireScope(c, 'mailbox.write');
  const key = c.get('apiKey')!;
  const req = await parseBody(c, claimMailboxRequestSchema);
  return ok(c, await claimMailbox(c.env, key.userId, key.role, req), 201);
});

export default app;
