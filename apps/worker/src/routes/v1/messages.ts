import { listMessagesQuerySchema, sendMailRequestSchema } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { buildSecureHeaders } from '../../lib/attachment-security.js';
import { AppError } from '../../lib/errors.js';
import { ok, parseBody, parseId, parseQuery } from '../../lib/http.js';
import { apiKeyAuth, requireScope } from '../../middleware/api-key-auth.js';
import {
  getMessageDetail,
  listMessages,
  loadAttachmentForViewer,
  type Viewer,
} from '../../services/message.js';
import { sendMail } from '../../services/outbound.js';
import { getObject } from '../../services/storage.js';
import type { AppContext } from '../../types.js';

const app = new Hono<AppContext>();
app.use('*', apiKeyAuth);

app.get('/', async (c) => {
  requireScope(c, 'mail.read');
  const key = c.get('apiKey')!;
  const query = parseQuery(c, listMessagesQuerySchema);
  const viewer: Viewer = { userId: key.userId, role: key.role, scope: query.scope };
  return ok(c, await listMessages(c.env, viewer, query));
});

app.post('/', async (c) => {
  requireScope(c, 'mail.send');
  const key = c.get('apiKey')!;
  const req = await parseBody(c, sendMailRequestSchema);
  const summary = await sendMail(c.env, c.executionCtx, { userId: key.userId, role: key.role }, req);
  return ok(c, summary, 201);
});

app.get('/:id', async (c) => {
  requireScope(c, 'mail.read');
  const key = c.get('apiKey')!;
  const id = parseId(c.req.param('id'));
  const viewer: Viewer = { userId: key.userId, role: key.role };
  return ok(c, await getMessageDetail(c.env, viewer, id));
});

app.get('/:id/attachments/:attId', async (c) => {
  requireScope(c, 'mail.read');
  const key = c.get('apiKey')!;
  const id = parseId(c.req.param('id'));
  const attId = parseId(c.req.param('attId'));
  const viewer: Viewer = { userId: key.userId, role: key.role };
  const att = await loadAttachmentForViewer(c.env, viewer, attId);
  if (att.messageId !== id) throw new AppError('not_found', '附件不存在');
  const obj = await getObject(c.env, att.r2Key);
  if (!obj) throw new AppError('not_found', '附件内容不存在');
  return new Response(obj.body, { status: 200, headers: buildSecureHeaders(att.mimeType, att.filename) });
});

export default app;
