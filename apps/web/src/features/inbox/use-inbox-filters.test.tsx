import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useInboxFilters } from './use-inbox-filters';

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/inbox']}>{children}</MemoryRouter>;
}

function useProbe() {
  const filters = useInboxFilters();
  const [params] = useSearchParams();
  return { ...filters, params };
}

describe('useInboxFilters', () => {
  it('选中地址时自动同步域名并写入 URL', () => {
    const { result } = renderHook(useProbe, { wrapper });
    act(() => result.current.setAddress('foo@a.com'));
    expect(result.current.filters.address).toBe('foo@a.com');
    expect(result.current.filters.domain).toBe('a.com');
    expect(result.current.params.get('address')).toBe('foo@a.com');
    expect(result.current.params.get('domain')).toBe('a.com');
  });

  it('切换域名时清空不属于该域的地址', () => {
    const { result } = renderHook(useProbe, { wrapper });
    act(() => result.current.setAddress('foo@a.com'));
    act(() => result.current.setDomain('b.com'));
    expect(result.current.filters.domain).toBe('b.com');
    expect(result.current.filters.address).toBeNull();
    expect(result.current.params.get('address')).toBeNull();
  });

  it('切换到地址所属域名时保留地址', () => {
    const { result } = renderHook(useProbe, { wrapper });
    act(() => result.current.setAddress('foo@a.com'));
    act(() => result.current.setDomain('a.com'));
    expect(result.current.filters.address).toBe('foo@a.com');
  });

  it('未读与关键词双向同步到 URL', () => {
    const { result } = renderHook(useProbe, { wrapper });
    act(() => result.current.setUnread(true));
    act(() => result.current.setQuery('发票'));
    expect(result.current.params.get('unread')).toBe('1');
    expect(result.current.params.get('q')).toBe('发票');
    act(() => result.current.setUnread(false));
    expect(result.current.params.get('unread')).toBeNull();
  });
});
