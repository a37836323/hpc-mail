import {
  deleteMessagesRequestSchema,
  listMessagesQuerySchema,
  markReadRequestSchema,
  sendMailRequestSchema,
  starMessagesRequestSchema,
} from '@hpc-mail/shared';
import { Hono, type Context } from 'hono';
import { ok, parseBody, parseId, parseQuery } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import {
  countUnread,
  deleteMessages,
  getMessageDetail,
  getRawMessageObject,
  listMessages,
  markMessages,
  purgeMessages,
  restoreMessages,
  starMessages,
  type Viewer,
} from '../services/message.js';
import { AppError } from '../lib/errors.js';
import { sendMail } from '../services/outbound.js';
import type { AppContext } from '../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth);

function viewerOf(c: Context<AppContext>): Viewer {
  const user = c.get('user')!;
  const q = c.req.query('scope');
  const scope = q === 'mine' ? 'mine' : q === 'all' ? 'all' : undefined;
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

/** 从回收站恢复 */
app.post('/restore', async (c) => {
  const req = await parseBody(c, deleteMessagesRequestSchema);
  const restored = await restoreMessages(c.env, viewerOf(c), req.ids);
  return ok(c, { restored });
});

/** 永久删除（回收站里彻底删） */
app.post('/purge', async (c) => {
  const req = await parseBody(c, deleteMessagesRequestSchema);
  const purged = await purgeMessages(c.env, viewerOf(c), req.ids);
  return ok(c, { purged });
});

app.post('/star', async (c) => {
  const req = await parseBody(c, starMessagesRequestSchema);
  const changed = await starMessages(c.env, viewerOf(c), req.ids, req.starred);
  return ok(c, { changed });
});

/** 侧栏收件箱未读角标：口径同 /inbox（scope=mine + inbound + 未读）。须在 /:id 之前注册 */
app.get('/unread-count', async (c) => {
  const user = c.get('user')!;
  return ok(c, { unread: await countUnread(c.env, user.id, user.role) });
});

/** 下载原始 .eml（须在 /:id 之前注册） */
app.get('/:id/raw', async (c) => {
  const id = parseId(c.req.param('id'));
  const obj = await getRawMessageObject(c.env, viewerOf(c), id);
  if (!obj) throw new AppError('not_found', '该邮件无原始存档');
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': 'message/rfc822',
      'Content-Disposition': `attachment; filename="message-${id}.eml"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
});

app.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  return ok(c, await getMessageDetail(c.env, viewerOf(c), id));
});

export default app;
