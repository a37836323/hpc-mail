import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="grid min-h-96 place-items-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <p className="text-5xl font-semibold text-ink-tertiary">404</p>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-ink">页面不存在</h1>
          <p className="text-sm text-ink-secondary">你访问的页面可能已被移动或删除。</p>
        </div>
        <Button asChild>
          <Link to="/inbox">返回收件箱</Link>
        </Button>
      </div>
    </div>
  );
}
