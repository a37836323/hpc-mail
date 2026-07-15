import { useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import type { ComboboxOption } from '@/components/ui/combobox';
import { FilterBar } from '@/features/inbox/filter-bar';
import { MailList } from '@/features/inbox/mail-list';
import { useInboxFilters } from '@/features/inbox/use-inbox-filters';
import { useMailboxesQuery } from '@/features/mailboxes/use-mailboxes';
import { usePublicConfig } from '@/lib/use-config';

export function AdminMailPage() {
  const { filters, setDomain, setAddress, setUnread, setQuery, reset } = useInboxFilters();
  const { data: config } = usePublicConfig();
  const { data: mailboxes } = useMailboxesQuery(true);

  const addressOptions = useMemo<ComboboxOption[]>(
    () =>
      (mailboxes ?? []).map((mailbox) => ({
        value: mailbox.address,
        label: mailbox.address,
        description: mailbox.ownerUsername,
      })),
    [mailboxes],
  );

  const hasActiveFilters = Boolean(filters.domain || filters.address || filters.unread || filters.q);

  const query = {
    direction: 'inbound' as const,
    scope: 'all' as const,
    domain: filters.domain ?? undefined,
    address: filters.address ?? undefined,
    unread: filters.unread || undefined,
    q: filters.q || undefined,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="全站邮件" description="所有域名 catch-all 收到的邮件，包含未认领地址。" />
      <div className="flex flex-col gap-4">
        <FilterBar
          filters={filters}
          domains={config?.domains ?? []}
          addressOptions={addressOptions}
          addressLabel="全站邮箱地址"
          onDomainChange={setDomain}
          onAddressChange={setAddress}
          onUnreadChange={setUnread}
          onQueryChange={setQuery}
        />
        <MailList
          query={query}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={reset}
          emptyTitle="暂无邮件"
          emptyDescription="全站还没有收到任何邮件。"
        />
      </div>
    </div>
  );
}
