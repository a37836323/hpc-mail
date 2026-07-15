import { PageHeader } from '@/components/page-header';
import { MailList } from '@/features/inbox/mail-list';

export function SentPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="已发送" description="你通过认领地址发出的邮件。" />
      <MailList
        query={{ direction: 'outbound', scope: 'mine' }}
        emptyTitle="还没有发送记录"
        emptyDescription="在写邮件页发送后，记录会显示在这里。"
      />
    </div>
  );
}
