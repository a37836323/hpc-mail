import { useQuery } from '@tanstack/react-query'
import { mailKeys } from '@/features/mail/queryKeys'
import { loadAllMailboxes } from './mailboxApi'

export function useMailboxes() {
  return useQuery({
    queryKey: mailKeys.mailboxes(),
    queryFn: ({ signal }) => loadAllMailboxes(signal),
    staleTime: 30_000,
  })
}
