import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { toast } from './toast';

export interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 降级到 execCommand
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ value, label, className, size = 'md' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = globalThis.setTimeout(() => setCopied(false), 1500);
    return () => globalThis.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    const ok = await writeClipboard(value);
    if (ok) {
      setCopied(true);
      toast({ title: '已复制到剪贴板', variant: 'success' });
    } else {
      toast({ title: '复制失败，请手动选择', variant: 'error' });
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? '已复制' : `复制${label ?? ''}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface font-medium text-ink transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3 text-sm',
        className,
      )}
    >
      {copied ? <Check className="size-4 text-positive" /> : <Copy className="size-4 text-ink-tertiary" />}
      {label && <span>{copied ? '已复制' : label}</span>}
    </button>
  );
}
