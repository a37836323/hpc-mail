import { PageHeader } from '@/components/page-header';
import { MailList } from '@/features/inbox/mail-list';

export function StarredPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="星标" description="你标记的重要邮件，跨收件箱与已发送。" />
      <MailList
        query={{ starred: true, scope: 'mine' }}
        emptyTitle="还没有星标邮件"
        emptyDescription="点击邮件行右侧的星标图标即可收藏。"
      />
    </div>
  );
}
