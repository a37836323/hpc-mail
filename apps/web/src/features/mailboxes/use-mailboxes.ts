import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/api/query-keys';
import { mailboxApi } from '@/api/resources';

export function useMailboxesQuery(all = false) {
  return useQuery({
    queryKey: queryKeys.mailboxes.list(all ? 'all' : 'mine'),
    queryFn: () => mailboxApi.list(all),
  });
}
