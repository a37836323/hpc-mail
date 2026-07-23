import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/cn';

export interface ProgressProps extends ComponentPropsWithRef<'div'> {
  /** 当前进度值 */
  value: number;
  /** 最大值，默认 100 */
  max?: number;
}

/** 轻量进度条：用于附件上传进度展示 */
export function Progress({ value, max = 100, className, ...props }: ProgressProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-hover', className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-150"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
