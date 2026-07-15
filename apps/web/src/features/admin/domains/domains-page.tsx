import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { domainSchema } from '@hpc-mail/shared';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/query-keys';
import { adminApi } from '@/api/resources';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useMailboxesQuery } from '@/features/mailboxes/use-mailboxes';

export function DomainsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: queryKeys.admin.settings,
    queryFn: () => adminApi.getSettings(),
  });
  // 全站已认领地址：用于删域名前预估影响面
  const { data: allMailboxes } = useMailboxesQuery(true);
  const [newDomain, setNewDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const list = settings?.domains.list ?? [];
  const affected = removing
    ? (allMailboxes ?? []).filter((box) => box.domain === removing)
    : [];

  const persist = useMutation({
    mutationFn: (nextList: string[]) => adminApi.updateSettings({ domains: { list: nextList } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.admin.settings, saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
    onError: (err) => toast({ title: err instanceof ApiError ? err.message : '保存失败，请重试', variant: 'error' }),
  });

  const addDomain = (event: FormEvent) => {
    event.preventDefault();
    const value = newDomain.trim().toLowerCase();
    const parsed = domainSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '域名格式非法');
      return;
    }
    if (list.includes(parsed.data)) {
      setError('该域名已在列表中');
      return;
    }
    persist.mutate([...list, parsed.data], {
      onSuccess: () => {
        toast({ title: '域名已添加', variant: 'success' });
        setNewDomain('');
        setError(null);
      },
    });
  };

  const confirmRemove = () => {
    if (!removing) return;
    persist.mutate(
      list.filter((domain) => domain !== removing),
      {
        onSuccess: () => {
          toast({ title: '域名已移除', variant: 'success' });
          setRemoving(null);
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="收件域名" description="控制系统的收件域名，用于前端展示、地址认领与发件白名单；增删即时生效。" />

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <form onSubmit={addDomain} className="flex items-start gap-2">
          <div className="flex-1">
            <Input
              placeholder="example.com"
              value={newDomain}
              invalid={error !== null}
              onChange={(event) => {
                setNewDomain(event.target.value);
                if (error) setError(null);
              }}
            />
            {error && <p className="mt-1 text-xs text-critical">{error}</p>}
          </div>
          <Button type="submit" variant="secondary" loading={persist.isPending}>
            <Plus className="size-4" />
            添加
          </Button>
        </form>

        {isLoading ? (
          <Skeleton className="h-24 w-full rounded-md" />
        ) : list.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {list.map((domain) => (
              <li
                key={domain}
                className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm"
              >
                <span className="font-mono text-ink">{domain}</span>
                <IconButton size="sm" aria-label={`移除 ${domain}`} onClick={() => setRemoving(domain)}>
                  <Trash2 className="size-4 text-critical" />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Globe}
            title="还没有配置收件域名"
            description="请先在 Cloudflare 为目标域开启 Email Routing 并把 catch-all 指向本 Worker，然后在这里把该域名添加进来。"
            className="rounded-md border border-dashed border-line"
          />
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => !next && setRemoving(null)}
        title="移除这个域名？"
        description={
          removing
            ? `移除 ${removing} 后，该域名将不再用于地址认领、发件白名单与前端展示。${
                affected.length > 0
                  ? `当前该域下有 ${affected.length} 个已认领地址，移除后这些用户将无法用该域发件（历史邮件仍保留、仍可收信直到 Cloudflare 侧关闭 catch-all）。`
                  : '（当前该域下暂无已认领地址。）'
              }`
            : undefined
        }
        confirmLabel="移除"
        tone="danger"
        loading={persist.isPending}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
