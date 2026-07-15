import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { AlertCircle, Inbox as InboxIcon, SearchX } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ListMessagesQuery } from '@hpc-mail/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import type { MessageSummary } from '@hpc-mail/shared';
import { MessageRow } from './message-row';
import { useMessagesQuery } from './use-messages';
import { useStarMutation } from './use-star';

export interface MailListProps {
  query: Partial<ListMessagesQuery>;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  emptyTitle: string;
  emptyDescription?: string;
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex gap-3 px-4 py-3.5">
          <Skeleton className="mt-1 size-2 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3.5 w-full max-w-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MailList({
  query,
  hasActiveFilters = false,
  onClearFilters,
  emptyTitle,
  emptyDescription,
}: MailListProps) {
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useMessagesQuery(query);
  const items = data?.pages.flatMap((page) => page.items) ?? [];

  const star = useStarMutation();
  const handleToggleStar = (message: MessageSummary) =>
    star.mutate({ id: message.id, starred: !message.isStarred });

  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (listRef.current) setScrollMargin(listRef.current.offsetTop);
  }, [items.length]);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 84,
    overscan: 8,
    scrollMargin,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;
    if (last.index >= items.length - 1 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [virtualItems, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) return <ListSkeleton />;

  if (isError && items.length === 0) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="加载失败"
        description={error instanceof Error ? error.message : '网络异常，请重试'}
        action={
          <Button variant="secondary" onClick={() => refetch()}>
            重试
          </Button>
        }
        className="rounded-lg border border-line bg-surface"
      />
    );
  }

  if (items.length === 0) {
    return hasActiveFilters ? (
      <EmptyState
        icon={SearchX}
        title="没有匹配的邮件"
        description="试试调整筛选条件或清除筛选。"
        action={
          onClearFilters && (
            <Button variant="secondary" onClick={onClearFilters}>
              清除筛选
            </Button>
          )
        }
        className="rounded-lg border border-line bg-surface"
      />
    ) : (
      <EmptyState
        icon={InboxIcon}
        title={emptyTitle}
        description={emptyDescription}
        className="rounded-lg border border-line bg-surface"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isError && (
        <div className="flex items-center gap-2 rounded-md border border-caution-soft bg-caution-soft px-3 py-2 text-sm text-caution">
          <AlertCircle className="size-4 shrink-0" />
          网络异常，显示的是缓存内容。
        </div>
      )}
      <div
        ref={listRef}
        className="relative overflow-hidden rounded-lg border border-line bg-surface"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualItem) => {
          const message = items[virtualItem.index];
          if (!message) return null;
          return (
            <div
              key={message.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${virtualItem.start - scrollMargin}px)` }}
            >
              <MessageRow message={message} onToggleStar={handleToggleStar} />
            </div>
          );
        })}
      </div>
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <Spinner className="size-5 text-ink-tertiary" />
        </div>
      )}
    </div>
  );
}
