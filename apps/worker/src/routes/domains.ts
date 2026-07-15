import { Hono } from 'hono';
import { ok } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { getVisibleDomains } from '../services/domain.js';
import type { AppContext } from '../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth);

/** 按角色返回可见域名：管理员=全部系统域名，普通用户=公开子集。认领/发件/收件筛选的前端选项来源。 */
app.get('/', async (c) => {
  const user = c.get('user')!;
  const domains = await getVisibleDomains(c.env, user.role === 'admin');
  return ok(c, domains);
});

export default app;
