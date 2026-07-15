import { useInfiniteQuery } from '@tanstack/react-query';
import type { ListMessagesQuery } from '@hpc-mail/shared';
import { queryKeys } from '@/api/query-keys';
import { messageApi } from '@/api/resources';

export function useMessagesQuery(query: Partial<ListMessagesQuery>) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages.list(query),
    queryFn: ({ pageParam }) => messageApi.list({ ...query, cursor: pageParam || undefined }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // 邮箱核心场景是「盯着收件箱等新邮件/验证码」：定时轮询 + 回到标签页即刷新，
    // 让新邮件自动出现，不必手动刷新页面。后台标签页不轮询（refetchIntervalInBackground 默认 false）。
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
}
