import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/toast';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

const GOTO: Record<string, string> = {
  i: '/inbox',
  s: '/sent',
  t: '/trash',
  r: '/starred',
  m: '/mailboxes',
};

/** 全局键盘快捷键：c 写信；g 后接 i/s/t/r/m 跳转；? 查看帮助。输入框内不触发。 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const pendingG = useRef(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;

      if (pendingG.current) {
        pendingG.current = false;
        const dest = GOTO[event.key.toLowerCase()];
        if (dest) {
          event.preventDefault();
          navigate(dest);
        }
        return;
      }

      if (event.key === 'g') {
        pendingG.current = true;
        window.setTimeout(() => {
          pendingG.current = false;
        }, 1200);
        return;
      }
      if (event.key === 'c') {
        event.preventDefault();
        navigate('/compose');
      } else if (event.key === '?') {
        event.preventDefault();
        toast({ title: '快捷键：c 写信 · g 后接 i/s/t/r/m 跳转（收件箱/已发送/回收站/星标/邮箱）' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
}
