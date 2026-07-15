import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/api/query-keys';
import { messageApi } from '@/api/resources';

/** 未读收件数（用户自己认领地址）。key 在 messages 前缀下，读/删/星标失效会连带刷新。 */
export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.messages.unreadCount,
    queryFn: () => messageApi.unreadCount(),
    staleTime: 30_000,
  });
}
