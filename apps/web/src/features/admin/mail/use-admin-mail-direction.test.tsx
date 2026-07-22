import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useAdminMailDirection } from './admin-mail-page';

function makeWrapper(initialEntry: string) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

function useProbe() {
  const state = useAdminMailDirection();
  const [params] = useSearchParams();
  return { ...state, params };
}

describe('useAdminMailDirection', () => {
  it('默认方向为已接收，URL 无 direction 参数', () => {
    const { result } = renderHook(useProbe, { wrapper: makeWrapper('/admin/mail') });
    expect(result.current.direction).toBe('inbound');
    expect(result.current.params.get('direction')).toBeNull();
  });

  it('切到已发送写入 URL，切回已接收时移除参数', () => {
    const { result } = renderHook(useProbe, { wrapper: makeWrapper('/admin/mail') });
    act(() => result.current.setDirection('outbound'));
    expect(result.current.direction).toBe('outbound');
    expect(result.current.params.get('direction')).toBe('outbound');
    act(() => result.current.setDirection('inbound'));
    expect(result.current.direction).toBe('inbound');
    expect(result.current.params.get('direction')).toBeNull();
  });

  it('切到已发送时清掉未读参数，保留其余筛选', () => {
    const { result } = renderHook(useProbe, {
      wrapper: makeWrapper('/admin/mail?unread=1&domain=a.com&q=发票'),
    });
    act(() => result.current.setDirection('outbound'));
    expect(result.current.params.get('unread')).toBeNull();
    expect(result.current.params.get('domain')).toBe('a.com');
    expect(result.current.params.get('q')).toBe('发票');
  });

  it('非法 direction 值回落为已接收', () => {
    const { result } = renderHook(useProbe, { wrapper: makeWrapper('/admin/mail?direction=bogus') });
    expect(result.current.direction).toBe('inbound');
  });
});
