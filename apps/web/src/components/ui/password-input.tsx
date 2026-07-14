import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/cn';
import { inputClassName } from './input';

export interface PasswordInputProps extends Omit<ComponentPropsWithRef<'input'>, 'type'> {
  invalid?: boolean;
}

export function PasswordInput({ className, invalid, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        aria-invalid={invalid || undefined}
        className={cn(
          inputClassName,
          'pr-10',
          invalid
            ? 'border-critical focus:border-critical focus:ring-2 focus:ring-critical/20'
            : 'border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20',
          className,
        )}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? '隐藏密码' : '显示密码'}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-ink-tertiary hover:text-ink-secondary"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
