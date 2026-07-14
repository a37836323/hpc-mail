import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends ComponentPropsWithRef<'textarea'> {
  invalid?: boolean;
}

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full rounded-md border bg-surface px-3 py-2 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-tertiary disabled:cursor-not-allowed disabled:opacity-60',
        invalid
          ? 'border-critical focus:border-critical focus:ring-2 focus:ring-critical/20'
          : 'border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20',
        className,
      )}
      {...props}
    />
  );
}
