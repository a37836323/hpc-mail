import { createApiKeyRequestSchema, updateApiKeyRequestSchema } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { ok, parseBody, parseId } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import {
  createApiKey,
  getApiKey,
  listApiKeys,
  revokeApiKey,
  updateApiKey,
} from '../services/api-key.js';
import type { AppContext } from '../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth);

/** 自助管理：只看/操作自己的 key */
app.get('/', async (c) => {
  const user = c.get('user')!;
  return ok(c, await listApiKeys(c.env, user.id));
});

app.post('/', async (c) => {
  const user = c.get('user')!;
  const req = await parseBody(c, createApiKeyRequestSchema);
  return ok(c, await createApiKey(c.env, user.id, req), 201);
});

app.get('/:id', async (c) => {
  const user = c.get('user')!;
  const id = parseId(c.req.param('id'));
  return ok(c, await getApiKey(c.env, id, user.id));
});

app.put('/:id', async (c) => {
  const user = c.get('user')!;
  const id = parseId(c.req.param('id'));
  const req = await parseBody(c, updateApiKeyRequestSchema);
  return ok(c, await updateApiKey(c.env, id, req, user.id));
});

app.delete('/:id', async (c) => {
  const user = c.get('user')!;
  const id = parseId(c.req.param('id'));
  await revokeApiKey(c.env, id, user.id);
  return ok(c, { success: true });
});

export default app;
