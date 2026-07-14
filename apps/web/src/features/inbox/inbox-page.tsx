import { useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import type { ComboboxOption } from '@/components/ui/combobox';
import { useMailboxesQuery } from '@/features/mailboxes/use-mailboxes';
import { usePublicConfig } from '@/lib/use-config';
import { FilterBar } from './filter-bar';
import { MailList } from './mail-list';
import { useInboxFilters } from './use-inbox-filters';

export function InboxPage() {
  const { filters, setDomain, setAddress, setUnread, setQuery, reset } = useInboxFilters();
  const { data: config } = usePublicConfig();
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
      <div className="flex flex-col gap-4">
        <FilterBar
          filters={filters}
          domains={config?.domains ?? []}
          addressOptions={addressOptions}
          onDomainChange={setDomain}
          onAddressChange={setAddress}
          onUnreadChange={setUnread}
          onQueryChange={setQuery}
        />
        <MailList
          query={query}
          variant="inbox"
          hasActiveFilters={hasActiveFilters}
          onClearFilters={reset}
          emptyTitle="还没有邮件"
          emptyDescription="发送到你已认领地址的邮件会出现在这里。"
        />
      </div>
    </div>
  );
}
