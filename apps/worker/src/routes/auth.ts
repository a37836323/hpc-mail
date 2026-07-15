import {
  changePasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  uploadAvatarRequestSchema,
  type SessionUser,
} from '@hpc-mail/shared';
import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { clientIp, ok, parseBody } from '../lib/http.js';
import { AppError } from '../lib/errors.js';
import { changePassword, login, logout, register } from '../services/auth.js';
import { avatarUrl, deleteAvatar, uploadAvatar } from '../services/avatar.js';
import type { AppContext, AuthUser } from '../types.js';

const app = new Hono<AppContext>();

function sessionUserOf(user: AuthUser, overrideAvatarUrl?: string | null): SessionUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    avatarUrl:
      overrideAvatarUrl !== undefined ? overrideAvatarUrl : avatarUrl(user.id, user.avatarKey),
  };
}

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
  return ok(c, sessionUserOf(c.get('user')!));
});

/** 上传头像（base64 图片）→ R2，返回更新后的 SessionUser */
app.post('/avatar', requireAuth, async (c) => {
  const req = await parseBody(c, uploadAvatarRequestSchema);
  const url = await uploadAvatar(c.env, c.get('user')!.id, req);
  return ok(c, sessionUserOf(c.get('user')!, url));
});

/** 删除头像，返回更新后的 SessionUser（avatarUrl=null） */
app.delete('/avatar', requireAuth, async (c) => {
  await deleteAvatar(c.env, c.get('user')!.id);
  return ok(c, sessionUserOf(c.get('user')!, null));
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
