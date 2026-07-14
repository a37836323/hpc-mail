import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary: 'border border-blue-600 bg-blue-600 text-white hover:border-blue-700 hover:bg-blue-700 focus-visible:ring-blue-500',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-blue-500',
  ghost: 'border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-blue-500',
  danger: 'border border-red-600 bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-[var(--radius-control)] px-3 text-sm',
  md: 'h-10 rounded-[var(--radius-control)] px-4 text-sm',
  lg: 'h-11 rounded-[var(--radius-control)] px-5 text-base',
  icon: 'size-10 rounded-[var(--radius-control)] p-0',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 font-semibold transition-[background-color,border-color,color,opacity] duration-[var(--motion-fast)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  )
})
