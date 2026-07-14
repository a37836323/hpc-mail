import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends ComponentPropsWithRef<'input'> {
  invalid?: boolean;
}

export const inputClassName =
  'h-9 w-full rounded-md border bg-surface px-3 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-tertiary disabled:cursor-not-allowed disabled:opacity-60';

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        inputClassName,
        invalid
          ? 'border-critical focus:border-critical focus:ring-2 focus:ring-critical/20'
          : 'border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20',
        className,
      )}
      {...props}
    />
  );
}
