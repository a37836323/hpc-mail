import {
  deleteMessagesRequestSchema,
  listMessagesQuerySchema,
  markReadRequestSchema,
  sendMailRequestSchema,
} from '@hpc-mail/shared';
import { Hono, type Context } from 'hono';
import { ok, parseBody, parseId, parseQuery } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import {
  deleteMessages,
  getMessageDetail,
  listMessages,
  markMessages,
  type Viewer,
} from '../services/message.js';
import { sendMail } from '../services/outbound.js';
import type { AppContext } from '../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth);

function viewerOf(c: Context<AppContext>): Viewer {
  const user = c.get('user')!;
  const scope = c.req.query('scope') === 'mine' ? 'mine' : undefined;
  return { userId: user.id, role: user.role, scope };
}

app.get('/', async (c) => {
  const query = parseQuery(c, listMessagesQuerySchema);
  const user = c.get('user')!;
  const viewer: Viewer = { userId: user.id, role: user.role, scope: query.scope };
  return ok(c, await listMessages(c.env, viewer, query));
});

app.post('/send', async (c) => {
  const user = c.get('user')!;
  const req = await parseBody(c, sendMailRequestSchema);
  const summary = await sendMail(c.env, c.executionCtx, { userId: user.id, role: user.role }, req);
  return ok(c, summary, 201);
});

app.post('/read', async (c) => {
  const req = await parseBody(c, markReadRequestSchema);
  const changed = await markMessages(c.env, viewerOf(c), req.ids, req.isRead);
  return ok(c, { changed });
});

app.post('/delete', async (c) => {
  const req = await parseBody(c, deleteMessagesRequestSchema);
  const deleted = await deleteMessages(c.env, viewerOf(c), req.ids);
  return ok(c, { deleted });
});

app.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  return ok(c, await getMessageDetail(c.env, viewerOf(c), id));
});

export default app;
