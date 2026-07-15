import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MessageDetail } from '@hpc-mail/shared';
import { queryKeys } from '@/api/query-keys';
import { messageApi } from '@/api/resources';
import { toast } from '@/components/ui/toast';

/** 星标切换：即时更新详情缓存，并失效列表（星标页会据此增删行）。 */
export function useStarMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, starred }: { id: number; starred: boolean }) => messageApi.star([id], starred),
    onSuccess: (_data, { id, starred }) => {
      queryClient.setQueryData<MessageDetail>(queryKeys.messages.detail(id), (prev) =>
        prev ? { ...prev, isStarred: starred } : prev,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.root });
    },
    onError: () => toast({ title: '操作失败，请重试', variant: 'error' }),
  });
}
