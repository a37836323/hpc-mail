import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import type { ComboboxOption } from '@/components/ui/combobox';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { FilterBar } from '@/features/inbox/filter-bar';
import { MailList } from '@/features/inbox/mail-list';
import { useInboxFilters } from '@/features/inbox/use-inbox-filters';
import { useMailboxesQuery } from '@/features/mailboxes/use-mailboxes';
import { useDomains } from '@/lib/use-config';

type Direction = 'inbound' | 'outbound';

const DIRECTION_OPTIONS = [
  { value: 'inbound', label: '已接收' },
  { value: 'outbound', label: '已发送' },
] as const;

const DIRECTION_COPY: Record<
  Direction,
  { description: string; addressLabel: string; emptyTitle: string; emptyDescription: string }
> = {
  inbound: {
    description: '所有域名 catch-all 收到的邮件，包含未认领地址。',
    addressLabel: '全站收件地址',
    emptyTitle: '暂无邮件',
    emptyDescription: '全站还没有收到任何邮件。',
  },
  outbound: {
    description: '全站所有用户与系统发出的邮件，包含未认领地址发件。',
    addressLabel: '全站发件地址',
    emptyTitle: '暂无已发送邮件',
    emptyDescription: '全站还没有发出过任何邮件。',
  },
};

/** 全站邮件方向（已接收/已发送）双向绑定 URL；切到已发送时清掉无意义的未读参数 */
export function useAdminMailDirection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const direction: Direction = searchParams.get('direction') === 'outbound' ? 'outbound' : 'inbound';

  const setDirection = useCallback(
    (next: Direction) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === 'outbound') {
            params.set('direction', 'outbound');
            // outbound 行恒为已读，未读筛选无意义，切换时一并清掉
            params.delete('unread');
          } else {
            params.delete('direction');
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { direction, setDirection };
}

export function AdminMailPage() {
  const { filters, setDomain, setAddress, setUnread, setQuery, reset } = useInboxFilters();
  const { direction, setDirection } = useAdminMailDirection();
  const { data: visibleDomains } = useDomains();
  const { data: mailboxes } = useMailboxesQuery(true);

  const isInbound = direction === 'inbound';
  const copy = DIRECTION_COPY[direction];

  const addressOptions = useMemo<ComboboxOption[]>(
    () =>
      (mailboxes ?? []).map((mailbox) => ({
        value: mailbox.address,
        label: mailbox.address,
        description: mailbox.ownerUsername,
      })),
    [mailboxes],
  );

  const hasActiveFilters = Boolean(
    filters.domain || filters.address || (isInbound && filters.unread) || filters.q,
  );

  const query = {
    direction,
    scope: 'all' as const,
    domain: filters.domain ?? undefined,
    address: filters.address ?? undefined,
    unread: (isInbound && filters.unread) || undefined,
    q: filters.q || undefined,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="全站邮件" description={copy.description} />
      <div className="flex flex-col gap-4">
        <SegmentedControl
          aria-label="邮件方向"
          value={direction}
          onValueChange={setDirection}
          options={DIRECTION_OPTIONS}
        />
        <FilterBar
          filters={filters}
          domains={visibleDomains ?? []}
          addressOptions={addressOptions}
          addressLabel={copy.addressLabel}
          showUnread={isInbound}
          onDomainChange={setDomain}
          onAddressChange={setAddress}
          onUnreadChange={setUnread}
          onQueryChange={setQuery}
        />
        <MailList
          query={query}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={reset}
          emptyTitle={copy.emptyTitle}
          emptyDescription={copy.emptyDescription}
        />
      </div>
    </div>
  );
}
