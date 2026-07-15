import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Forward, ImageOff, MailOpen, Paperclip, Reply, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MessageDetail } from '@hpc-mail/shared';
import { queryKeys } from '@/api/query-keys';
import { messageApi } from '@/api/resources';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { buildForward, buildReply } from '@/features/compose/compose-init';
import { useStarMutation } from '@/features/inbox/use-star';
import { cn } from '@/lib/cn';
import { countRemoteImages } from './count-remote-images';
import { EmailHtml } from '@/lib/email-html';
import { formatBytes, formatDateTime } from '@/lib/format';
import { extractOtp } from '@/lib/otp';
import { OtpBanner } from './otp-banner';

export function MessagePage() {
  const { id } = useParams();
  const messageId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRemoteImages, setShowRemoteImages] = useState(false);
  const markedRef = useRef(false);

  const { data: message, isLoading, isError } = useQuery({
    queryKey: queryKeys.messages.detail(messageId),
    queryFn: () => messageApi.detail(messageId),
    enabled: Number.isFinite(messageId),
  });

  const star = useStarMutation();

  const markRead = useMutation({
    mutationFn: (isRead: boolean) => messageApi.markRead([messageId], isRead),
    onSuccess: (_data, isRead) => {
      queryClient.setQueryData<MessageDetail>(queryKeys.messages.detail(messageId), (prev) =>
        prev ? { ...prev, isRead } : prev,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.root });
    },
  });

  useEffect(() => {
    if (message && !message.isRead && !markedRef.current) {
      markedRef.current = true;
      markRead.mutate(true);
    }
    // 只在消息首次加载为未读时触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id, message?.isRead]);

  const deleteMutation = useMutation({
    mutationFn: () => messageApi.remove([messageId]),
    onSuccess: () => {
      toast({ title: '邮件已删除', variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.root });
      navigate(-1);
    },
    onError: () => toast({ title: '删除失败，请重试', variant: 'error' }),
  });

  const handleMarkUnread = () => {
    markRead.mutate(false);
    navigate(-1);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !message) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          title="邮件不存在"
          description="该邮件可能已被删除或你没有访问权限。"
          action={
            <Button variant="secondary" onClick={() => navigate(-1)}>
              返回
            </Button>
          }
          className="rounded-lg border border-line bg-surface"
        />
      </div>
    );
  }

  const otpCode = message.verificationCode || extractOtp(message.subject, message.bodyText)?.code;
  const recipients = [...message.recipients.to, ...message.recipients.cc];
  const remoteImageCount = message.bodyHtml ? countRemoteImages(message.bodyHtml) : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-2">
        <IconButton aria-label="返回" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => navigate('/compose', { state: buildReply(message) })}>
            <Reply className="size-4" />
            回复
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/compose', { state: buildForward(message) })}>
            <Forward className="size-4" />
            转发
          </Button>
          <IconButton
            aria-label={message.isStarred ? '取消星标' : '加星标'}
            aria-pressed={message.isStarred}
            onClick={() => star.mutate({ id: message.id, starred: !message.isStarred })}
          >
            <Star className={cn('size-4', message.isStarred ? 'fill-caution text-caution' : 'text-ink-tertiary')} />
          </IconButton>
          <IconButton aria-label="标为未读" onClick={handleMarkUnread}>
            <MailOpen className="size-4" />
          </IconButton>
          <IconButton aria-label="删除邮件" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4 text-critical" />
          </IconButton>
        </div>
      </div>

      <article className="overflow-hidden rounded-lg border border-line bg-surface">
        <header className="border-b border-line px-5 py-4">
          <h1 className="text-lg font-semibold text-ink">{message.subject || '（无主题）'}</h1>
          <div className="mt-2 flex flex-col gap-1 text-sm text-ink-secondary">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium text-ink">{message.fromName || message.fromAddress}</span>
              {message.fromName && <span className="text-ink-tertiary">&lt;{message.fromAddress}&gt;</span>}
            </div>
            {recipients.length > 0 && (
              <p className="text-ink-tertiary">
                收件人：<span className="text-ink-secondary">{recipients.join('、')}</span>
              </p>
            )}
            <p className="text-ink-tertiary">{formatDateTime(message.createdAt)}</p>
          </div>
        </header>

        <div className="flex flex-col gap-4 px-5 py-5">
          {otpCode && <OtpBanner code={otpCode} />}

          {remoteImageCount > 0 && !showRemoteImages && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-canvas px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-ink-secondary">
                <ImageOff className="size-4 shrink-0 text-ink-tertiary" />
                已阻止 {remoteImageCount} 张远程图片以保护隐私
              </span>
              <Button variant="secondary" size="sm" onClick={() => setShowRemoteImages(true)}>
                显示图片
              </Button>
            </div>
          )}

          {message.bodyHtml ? (
            <EmailHtml
              html={message.bodyHtml}
              allowRemoteImages={showRemoteImages}
              trustedImageOrigins={[globalThis.location.origin]}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink">
              {message.bodyText || '（无正文）'}
            </pre>
          )}

          {message.attachments.length > 0 && (
            <div className="border-t border-line pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink-secondary">
                <Paperclip className="size-4" />
                {message.attachments.length} 个附件
              </p>
              <ul className="flex flex-col gap-2">
                {message.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-md border border-line px-3 py-2 text-sm transition-colors hover:bg-surface-hover"
                    >
                      <span className="min-w-0 flex-1 truncate text-ink">{attachment.filename}</span>
                      <span className="shrink-0 text-xs text-ink-tertiary">{formatBytes(attachment.size)}</span>
                      <Download className="size-4 shrink-0 text-ink-tertiary" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </article>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="删除这封邮件？"
        description="删除后无法恢复，附件也会一并移除。"
        confirmLabel="删除"
        tone="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
