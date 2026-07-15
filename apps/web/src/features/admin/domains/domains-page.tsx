import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { domainSchema } from '@hpc-mail/shared';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/query-keys';
import { adminApi } from '@/api/resources';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';

export function DomainsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: queryKeys.admin.settings,
    queryFn: () => adminApi.getSettings(),
  });
  const [draft, setDraft] = useState<string[] | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings && draft === null) setDraft([...settings.domains.list]);
  }, [settings, draft]);

  const save = useMutation({
    mutationFn: (list: string[]) => adminApi.updateSettings({ domains: { list } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.admin.settings, saved);
      setDraft([...saved.domains.list]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.config });
      toast({ title: '收件域名已保存', variant: 'success' });
    },
    onError: (err) => toast({ title: err instanceof ApiError ? err.message : '保存失败，请重试', variant: 'error' }),
  });

  if (isLoading || draft === null) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  const savedList = settings?.domains.list ?? [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedList);

  const addDomain = (event: FormEvent) => {
    event.preventDefault();
    const value = newDomain.trim().toLowerCase();
    const parsed = domainSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '域名格式非法');
      return;
    }
    if (draft.includes(parsed.data)) {
      setError('该域名已在列表中');
      return;
    }
    setDraft([...draft, parsed.data]);
    setNewDomain('');
    setError(null);
  };

  const removeDomain = (domain: string) => setDraft(draft.filter((item) => item !== domain));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="收件域名"
        description="控制系统的收件域名，用于前端展示、地址认领与发件白名单。"
        actions={
          <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(draft)}>
            保存
          </Button>
        }
      />

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
          <Button type="submit" variant="secondary">
            <Plus className="size-4" />
            添加
          </Button>
        </form>

        {draft.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {draft.map((domain) => (
              <li
                key={domain}
                className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm"
              >
                <span className="font-mono text-ink">{domain}</span>
                <IconButton size="sm" aria-label={`移除 ${domain}`} onClick={() => removeDomain(domain)}>
                  <Trash2 className="size-4 text-critical" />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Globe}
            title="还没有配置任何收件域名"
            description="添加域名前，需先在 Cloudflare 为该域开启 Email Routing 并把 catch-all 指向本 Worker。"
            className="rounded-md border border-dashed border-line"
          />
        )}
      </div>
    </div>
  );
}
