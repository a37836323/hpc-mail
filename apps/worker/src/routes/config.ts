import type { PublicConfig } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { ok } from '../lib/http.js';
import { getSettings } from '../services/setting.js';
import type { AppContext } from '../types.js';

const app = new Hono<AppContext>();

/** 公开配置：站点名 / 注册模式 / 域名表（无鉴权） */
app.get('/', async (c) => {
  const settings = await getSettings(c.env);
  const config: PublicConfig = {
    siteTitle: settings.site.title,
    registrationMode: settings.register_mode,
    domains: c.env.domain,
  };
  return ok(c, config);
});

export default app;
