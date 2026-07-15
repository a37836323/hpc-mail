import { createApp } from './app.js';
import { handleInbound } from './services/inbound.js';
import { runScheduled } from './services/scheduled.js';
import type { Env } from './types.js';

const app = createApp();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/v1')) {
      return app.fetch(request, env, ctx);
    }
    // 其余路径交给静态资源（SPA fallback 由 assets 处理）
    const res = await env.assets.fetch(request);
    // .md（如 /skill.md）assets 默认不带 charset，浏览器会按非 UTF-8 解析导致中文乱码，补上
    if (url.pathname.endsWith('.md')) {
      const headers = new Headers(res.headers);
      headers.set('Content-Type', 'text/markdown; charset=utf-8');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleInbound(message, env, ctx);
  },

  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runScheduled(env);
  },
};
