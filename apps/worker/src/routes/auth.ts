import {
  changePasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  type SessionUser,
} from '@hpc-mail/shared';
import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { clientIp, ok, parseBody } from '../lib/http.js';
import { AppError } from '../lib/errors.js';
import { changePassword, login, logout, register } from '../services/auth.js';
import type { AppContext } from '../types.js';

const app = new Hono<AppContext>();

app.post('/login', async (c) => {
  const req = await parseBody(c, loginRequestSchema);
  const result = await login(c.env, req, clientIp(c));
  return ok(c, result);
});

app.post('/register', async (c) => {
  const req = await parseBody(c, registerRequestSchema);
  const result = await register(c.env, req, clientIp(c));
  return ok(c, result, 201);
});

app.get('/me', requireAuth, (c) => {
  const user = c.get('user')!;
  const sessionUser: SessionUser = {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
  return ok(c, sessionUser);
});

app.put('/password', requireAuth, async (c) => {
  const req = await parseBody(c, changePasswordRequestSchema);
  const result = await changePassword(c.env, c.get('user')!, req);
  return ok(c, result);
});

app.post('/logout', requireAuth, async (c) => {
  const sid = c.get('sessionId');
  if (!sid) throw new AppError('unauthorized', '会话不存在');
  await logout(c.env, sid);
  return ok(c, { success: true });
});

export default app;
