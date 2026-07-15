import { useInfiniteQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { adminApi } from '@/api/resources';
import { PageHeader } from '@/components/page-header';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';

const ACTION_META: Record<string, { label: string; tone: BadgeTone }> = {
  'user.create': { label: '创建用户', tone: 'positive' },
  'user.update': { label: '修改用户', tone: 'neutral' },
  'user.delete': { label: '删除用户', tone: 'critical' },
  'settings.update': { label: '修改设置', tone: 'caution' },
  'invite.create': { label: '生成邀请码', tone: 'neutral' },
  'invite.revoke': { label: '作废邀请码', tone: 'neutral' },
  'apikey.revoke': { label: '吊销密钥', tone: 'critical' },
};

export function AuditPage() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['admin', 'audit-logs'],
    queryFn: ({ pageParam }) => adminApi.auditLogs(pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const logs = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="操作审计" description="管理员的高危操作记录（删户、改密、改设置、邀请、吊销密钥等）。" />
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="暂无审计记录"
          description="管理员执行敏感操作后会记录在这里。"
          className="rounded-lg border border-line bg-surface"
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>操作人</TableHead>
                <TableHead>动作</TableHead>
                <TableHead>目标</TableHead>
                <TableHead>详情</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const meta = ACTION_META[log.action] ?? { label: log.action, tone: 'neutral' as BadgeTone };
                return (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-ink-tertiary">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium text-ink">{log.actorName}</TableCell>
                    <TableCell>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-ink-secondary">{log.target || '—'}</TableCell>
                    <TableCell className="text-ink-secondary">{log.detail || '—'}</TableCell>
                    <TableCell className="font-mono text-xs text-ink-tertiary">{log.ip || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {hasNextPage && (
            <div className="mt-3 text-center">
              <Button variant="secondary" size="sm" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
                加载更多
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
