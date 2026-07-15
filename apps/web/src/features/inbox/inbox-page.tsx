import { AtSign } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import type { ComboboxOption } from '@/components/ui/combobox';
import { EmptyState } from '@/components/ui/empty-state';
import { useMailboxesQuery } from '@/features/mailboxes/use-mailboxes';
import { useDomains } from '@/lib/use-config';
import { FilterBar } from './filter-bar';
import { MailList } from './mail-list';
import { useInboxFilters } from './use-inbox-filters';

export function InboxPage() {
  const { filters, setDomain, setAddress, setUnread, setQuery, reset } = useInboxFilters();
  const { data: visibleDomains } = useDomains();
  const { data: mailboxes } = useMailboxesQuery(false);

  const addressOptions = useMemo<ComboboxOption[]>(
    () =>
      (mailboxes ?? []).map((mailbox) => ({
        value: mailbox.address,
        label: mailbox.address,
        description: mailbox.displayName || undefined,
      })),
    [mailboxes],
  );

  const hasActiveFilters = Boolean(filters.domain || filters.address || filters.unread || filters.q);
  // 尚未认领任何地址：收件箱注定为空，直接引导去认领（mailboxes 已加载且为空）
  const noMailbox = mailboxes !== undefined && mailboxes.length === 0;

  const query = {
    direction: 'inbound' as const,
    scope: 'mine' as const,
    domain: filters.domain ?? undefined,
    address: filters.address ?? undefined,
    unread: filters.unread || undefined,
    q: filters.q || undefined,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="收件箱" />
      {noMailbox ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState
            icon={AtSign}
            title="你还没有认领任何邮箱地址"
            description="认领一个地址后，发送到它的邮件才会出现在这里。任意前缀 + 开放域名即可，地址全局唯一。"
            action={
              <Button asChild>
                <Link to="/mailboxes">去认领一个</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <FilterBar
            filters={filters}
            domains={visibleDomains ?? []}
            addressOptions={addressOptions}
            onDomainChange={setDomain}
            onAddressChange={setAddress}
            onUnreadChange={setUnread}
            onQueryChange={setQuery}
          />
          <MailList
            query={query}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={reset}
            emptyTitle="还没有邮件"
            emptyDescription="发送到你已认领地址的邮件会出现在这里。"
          />
        </div>
      )}
    </div>
  );
}
