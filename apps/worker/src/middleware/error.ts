import type { Context, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorBody } from '@hpc-mail/shared';
import { AppError } from '../lib/errors.js';
import type { AppContext } from '../types.js';

/** 每请求分配 requestId 并回显 X-Request-ID */
export const requestId: MiddlewareHandler<AppContext> = async (c, next) => {
  const id = c.req.header('X-Request-ID') || crypto.randomUUID();
  c.set('requestId', id);
  c.header('X-Request-ID', id);
  await next();
};

/** 统一错误信封：{ error:{code,message}, requestId } + 语义化状态码 */
export function onError(err: Error, c: Context<AppContext>): Response {
  const rid = c.get('requestId') ?? crypto.randomUUID();
  if (err instanceof AppError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message }, requestId: rid };
    return c.json(body, err.status as ContentfulStatusCode);
  }
  console.error('unhandled error:', err);
  const body: ApiErrorBody = {
    error: { code: 'internal', message: '服务器内部错误' },
    requestId: rid,
  };
  return c.json(body, 500);
}
