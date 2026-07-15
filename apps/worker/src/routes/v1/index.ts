import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ok } from '../../lib/http.js';
import { apiKeyAuth } from '../../middleware/api-key-auth.js';
import { getDomains } from '../../services/domain.js';
import type { AppContext } from '../../types.js';
import v1Mailboxes from './mailboxes.js';
import v1Messages from './messages.js';

const app = new Hono<AppContext>();

// 仅对 /v1 开 CORS（允许 Authorization 头）
app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    exposeHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  }),
);

app.get('/status', apiKeyAuth, (c) => {
  const key = c.get('apiKey')!;
  return ok(c, { status: 'operational', userId: key.userId, role: key.role, scopes: key.scopes });
});

app.get('/domains', apiKeyAuth, async (c) => ok(c, { domains: await getDomains(c.env) }));

app.route('/mailboxes', v1Mailboxes);
app.route('/messages', v1Messages);

export default app;
