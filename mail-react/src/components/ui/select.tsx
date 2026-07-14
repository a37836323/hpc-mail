import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-[border-color,box-shadow]',
        'hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50',
        '[&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild><ChevronDown className="size-4 text-slate-500" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({ className, children, position = 'popper', ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        className={cn(
          'z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius-panel)] border border-slate-200 bg-white shadow-[var(--shadow-popover)]',
          position === 'popper' && 'translate-y-1',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-7 items-center justify-center"><ChevronUp className="size-4" /></SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-7 items-center justify-center"><ChevronDown className="size-4" /></SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex min-h-9 cursor-default select-none items-center rounded-[var(--radius-control)] py-2 pl-8 pr-3 text-sm text-slate-800 outline-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-900',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 grid size-4 place-items-center">
        <SelectPrimitive.ItemIndicator><Check className="size-4" /></SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export const SelectGroup = SelectPrimitive.Group
export const SelectLabel = SelectPrimitive.Label
export const SelectSeparator = SelectPrimitive.Separator
