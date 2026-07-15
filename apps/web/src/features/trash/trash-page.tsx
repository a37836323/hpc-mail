import { PageHeader } from '@/components/page-header';
import { MailList } from '@/features/inbox/mail-list';

export function TrashPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="回收站" description="删除的邮件在此保留 7 天，可恢复或永久删除，过期自动清理。" />
      <MailList
        query={{ scope: 'mine', trash: true }}
        variant="trash"
        emptyTitle="回收站是空的"
        emptyDescription="删除的邮件会先移到这里，7 天后自动清除。"
      />
    </div>
  );
}
