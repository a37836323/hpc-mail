import { AlertTriangle } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function RouteErrorPage() {
  const error = useRouteError();
  const title = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : '页面出错了';
  const message = isRouteErrorResponse(error)
    ? '请求的页面无法加载。'
    : error instanceof Error
      ? error.message
      : '发生了未知错误，请重试。';

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-critical-soft text-critical">
          <AlertTriangle className="size-6" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-ink">{title}</h1>
          <p className="text-sm text-ink-secondary">{message}</p>
        </div>
        <Button onClick={() => globalThis.location.reload()}>刷新页面</Button>
      </div>
    </div>
  );
}
