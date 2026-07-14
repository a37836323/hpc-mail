import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/cn';

export interface FilterChipProps extends ComponentPropsWithRef<'button'> {
  active?: boolean;
}

export function FilterChip({ className, active = false, type = 'button', ...props }: FilterChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        active
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line-strong bg-surface text-ink-secondary hover:bg-surface-hover hover:text-ink',
        className,
      )}
      {...props}
    />
  );
}
