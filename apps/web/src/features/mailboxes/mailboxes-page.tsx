import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AtSign, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { Mailbox } from '@hpc-mail/shared';
import { queryKeys } from '@/api/query-keys';
import { mailboxApi } from '@/api/resources';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/format';
import { usePublicConfig } from '@/lib/use-config';
import { ClaimDialog } from './claim-dialog';
import { useMailboxesQuery } from './use-mailboxes';

function EditMailboxDialog({ mailbox, onClose }: { mailbox: Mailbox | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');

  const mutation = useMutation({
    mutationFn: (id: number) => mailboxApi.update(id, { displayName: displayName.trim() }),
    onSuccess: () => {
      toast({ title: '备注已更新', variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes.root });
      onClose();
    },
    onError: () => toast({ title: '更新失败，请重试', variant: 'error' }),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (mailbox) mutation.mutate(mailbox.id);
  };

  return (
    <Dialog
      open={mailbox !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
        else setDisplayName(mailbox?.displayName ?? '');
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader title="编辑备注" description={mailbox?.address} />
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <FormField label="备注名">
              {(field) => (
                <Input
                  {...field}
                  autoFocus
                  maxLength={64}
                  placeholder="便于识别的名称"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              )}
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MailboxesPage() {
  const queryClient = useQueryClient();
  const { data: config } = usePublicConfig();
  const { data: mailboxes, isLoading } = useMailboxesQuery(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [releasing, setReleasing] = useState<Mailbox | null>(null);
  const [editing, setEditing] = useState<Mailbox | null>(null);

  const release = useMutation({
    mutationFn: (id: number) => mailboxApi.release(id),
    onSuccess: () => {
      toast({ title: '地址已释放', variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes.root });
      setReleasing(null);
    },
    onError: () => toast({ title: '释放失败，请重试', variant: 'error' }),
  });

  const items = mailboxes ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="我的邮箱"
        description="认领任意前缀 + 系统域名的地址，全局唯一占用。"
        actions={
          <Button onClick={() => setClaimOpen(true)}>
            <Plus className="size-4" />
            认领地址
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={AtSign}
          title="还没有认领任何地址"
          description="认领一个地址后即可收发邮件。"
          action={<Button onClick={() => setClaimOpen(true)}>认领地址</Button>}
          className="rounded-lg border border-line bg-surface"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>地址</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>邮件数</TableHead>
              <TableHead>认领时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((mailbox) => (
              <TableRow key={mailbox.id}>
                <TableCell className="font-medium">{mailbox.address}</TableCell>
                <TableCell className="text-ink-secondary">{mailbox.displayName || '—'}</TableCell>
                <TableCell className="text-ink-secondary">{mailbox.messageCount}</TableCell>
                <TableCell className="text-ink-tertiary">{formatDateTime(mailbox.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <IconButton size="sm" aria-label="编辑备注" onClick={() => setEditing(mailbox)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton size="sm" aria-label="释放地址" onClick={() => setReleasing(mailbox)}>
                      <Trash2 className="size-4 text-critical" />
                    </IconButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ClaimDialog open={claimOpen} onOpenChange={setClaimOpen} domains={config?.domains ?? []} />
      <EditMailboxDialog mailbox={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={releasing !== null}
        onOpenChange={(next) => !next && setReleasing(null)}
        title="释放这个地址？"
        description={
          releasing
            ? `释放 ${releasing.address} 后，其他用户可重新认领；你将不再看到该地址的邮件。`
            : undefined
        }
        confirmLabel="释放"
        tone="danger"
        loading={release.isPending}
        onConfirm={() => releasing && release.mutate(releasing.id)}
      />
    </div>
  );
}
