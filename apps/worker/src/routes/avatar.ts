import { Hono } from 'hono';
import { AppError } from '../lib/errors.js';
import { parseId } from '../lib/http.js';
import { getAvatarObject } from '../services/avatar.js';
import type { AppContext } from '../types.js';

const app = new Hono<AppContext>();

/** 公开头像下发（无鉴权，供 <img src> 直接加载；URL 带 ?v= 版本号防缓存） */
app.get('/:userId', async (c) => {
  const userId = parseId(c.req.param('userId'));
  const obj = await getAvatarObject(c.env, userId);
  if (!obj) throw new AppError('not_found', '头像不存在');
  const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      // 有 ?v 版本号兜底，同一 URL 内容不变，可长缓存；换头像 ?v 变即时生效
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

export default app;
