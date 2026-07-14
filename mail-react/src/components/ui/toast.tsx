import * as ToastPrimitive from '@radix-ui/react-toast'
import { CircleCheck, CircleX, Info, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

export type ToastVariant = 'default' | 'success' | 'error'

export interface ToastInput {
  title: string
  description?: string
  duration?: number
  variant?: ToastVariant
}

interface ToastItem extends ToastInput {
  id: number
}

type Listener = (item: ToastItem) => void
const listeners = new Set<Listener>()
let nextToastId = 1

export function toast(input: ToastInput): number {
  const item = { ...input, id: nextToastId++ }
  listeners.forEach((listener) => listener(item))
  return item.id
}

const iconByVariant = {
  default: Info,
  success: CircleCheck,
  error: CircleX,
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const listener: Listener = (item) => setItems((current) => [...current.slice(-3), item])
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {children}
      {items.map((item) => {
        const variant = item.variant ?? 'default'
        const Icon = iconByVariant[variant]
        return (
          <ToastPrimitive.Root
            key={item.id}
            defaultOpen
            duration={item.duration ?? 4500}
            onOpenChange={(open) => {
              if (!open) setItems((current) => current.filter(({ id }) => id !== item.id))
            }}
            className={cn(
              'grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-[var(--radius-panel)] border bg-white p-4 shadow-[var(--shadow-popover)]',
              'data-[state=closed]:animate-out data-[state=open]:animate-in',
              variant === 'error' ? 'border-red-200' : 'border-slate-200',
            )}
          >
            <Icon className={cn('mt-0.5 size-5', variant === 'success' && 'text-emerald-600', variant === 'error' && 'text-red-600', variant === 'default' && 'text-blue-600')} />
            <div className="min-w-0">
              <ToastPrimitive.Title className="text-sm font-semibold text-slate-950">{item.title}</ToastPrimitive.Title>
              {item.description && <ToastPrimitive.Description className="mt-1 text-sm text-slate-600">{item.description}</ToastPrimitive.Description>}
            </div>
            <ToastPrimitive.Close className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="关闭通知">
              <X className="size-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        )
      })}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
    </ToastPrimitive.Provider>
  )
}
