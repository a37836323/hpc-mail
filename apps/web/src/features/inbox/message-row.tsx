import { KeyRound, Paperclip, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { MessageSummary, OutboundStatus } from '@hpc-mail/shared';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';

const OUTBOUND_STATUS: Record<OutboundStatus, { label: string; tone: BadgeTone }> = {
  sent: { label: '已发送', tone: 'neutral' },
  delivered: { label: '已送达', tone: 'positive' },
  bounced: { label: '退信', tone: 'critical' },
  failed: { label: '失败', tone: 'critical' },
  complained: { label: '投诉', tone: 'caution' },
  delayed: { label: '延迟', tone: 'caution' },
};

export function MessageRow({
  message,
  onToggleStar,
}: {
  message: MessageSummary;
  onToggleStar: (message: MessageSummary) => void;
}) {
  const outbound = message.direction === 'outbound';
  const unread = !outbound && !message.isRead;
  const primary = outbound ? message.address : message.fromName || message.fromAddress;
  const status = OUTBOUND_STATUS[message.status as OutboundStatus];

  return (
    <div className="relative border-b border-line bg-surface transition-colors hover:bg-surface-hover">
      <Link to={`/mail/${message.id}`} className="flex items-start gap-3 py-3 pl-4 pr-11">
        <span className="mt-1.5 flex w-2 shrink-0 justify-center">
          {unread && <span className="size-2 rounded-full bg-accent" aria-label="未读" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn('truncate text-sm text-ink', unread ? 'font-semibold' : 'font-medium')}>
              {primary}
            </span>
            <span className="shrink-0 text-xs text-ink-tertiary">{formatRelativeTime(message.createdAt)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className={cn('truncate text-sm', unread ? 'font-medium text-ink' : 'text-ink-secondary')}>
              {message.subject || '（无主题）'}
            </span>
            {message.hasAttachments && <Paperclip className="size-3.5 shrink-0 text-ink-tertiary" />}
            {message.verificationCode && (
              <Badge tone="caution" className="shrink-0">
                <KeyRound className="size-3" />
                {message.verificationCode}
              </Badge>
            )}
            {outbound && status && (
              <Badge tone={status.tone} className="shrink-0">
                {status.label}
              </Badge>
            )}
          </div>
          {message.preview && <p className="mt-0.5 truncate text-sm text-ink-tertiary">{message.preview}</p>}
        </div>
      </Link>

      <button
        type="button"
        aria-label={message.isStarred ? '取消星标' : '加星标'}
        aria-pressed={message.isStarred}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleStar(message);
        }}
        className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md transition-colors hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Star className={cn('size-4', message.isStarred ? 'fill-caution text-caution' : 'text-ink-tertiary')} />
      </button>
    </div>
  );
}
