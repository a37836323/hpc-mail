import { CircleCheck, CircleX, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export type ToastVariant = 'default' | 'success' | 'error';

export interface ToastInput {
  title: string;
  description?: string;
  duration?: number;
  variant?: ToastVariant;
}

interface ToastItem extends ToastInput {
  id: number;
}

type Listener = (item: ToastItem) => void;
const listeners = new Set<Listener>();
let nextToastId = 1;

/** 模块级触发器：任意位置（含 mutation 回调）可直接调用 */
export function toast(input: ToastInput): void {
  const item: ToastItem = { ...input, id: nextToastId++ };
  listeners.forEach((listener) => listener(item));
}

const ICONS: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CircleCheck,
  error: CircleX,
};

const ICON_TONES: Record<ToastVariant, string> = {
  default: 'text-accent',
  success: 'text-positive',
  error: 'text-critical',
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const variant = item.variant ?? 'default';
  const Icon = ICONS[variant];

  useEffect(() => {
    const timer = globalThis.setTimeout(() => onDismiss(item.id), item.duration ?? 4000);
    return () => globalThis.clearTimeout(timer);
  }, [item.id, item.duration, onDismiss]);

  return (
    <div
      role="status"
      className="pointer-events-auto grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg border border-line bg-surface p-4 shadow-md"
    >
      <Icon className={cn('mt-0.5 size-5', ICON_TONES[variant])} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{item.title}</p>
        {item.description && <p className="mt-0.5 text-sm text-ink-secondary">{item.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="关闭通知"
        className="grid size-6 place-items-center rounded-md text-ink-tertiary hover:bg-surface-hover hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener: Listener = (item) => setItems((current) => [...current.slice(-2), item]);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const dismiss = (id: number) => setItems((current) => current.filter((item) => item.id !== id));

  return (
    <>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end sm:max-w-sm"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
}
