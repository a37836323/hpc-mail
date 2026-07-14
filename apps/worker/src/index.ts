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
    return env.assets.fetch(request);
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleInbound(message, env, ctx);
  },

  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runScheduled(env);
  },
};
