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
  });
}
