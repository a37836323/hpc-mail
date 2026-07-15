import { describe, expect, it } from 'vitest';
import type { MessageDetail } from '@hpc-mail/shared';
import { buildForward, buildReply } from './compose-init';

function makeDetail(overrides: Partial<MessageDetail> = {}): MessageDetail {
  return {
    id: 42,
    direction: 'inbound',
    address: 'me@hpc.email',
    domain: 'hpc.email',
    fromAddress: 'alice@example.com',
    fromName: 'Alice',
    subject: '账单通知',
    preview: '',
    verificationCode: '',
    status: 'received',
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    size: 0,
    createdAt: '2026-07-15T02:00:00.000Z',
    recipients: { to: ['me@hpc.email'], cc: [], bcc: [] },
    bodyText: '您的账单已生成\n请查收',
    bodyHtml: '',
    errorDetail: '',
    attachments: [],
    hasRaw: false,
    ...overrides,
  };
}

describe('buildReply / buildForward', () => {
  it('回复预填收件人、Re: 主题、引用块、发件身份与 replyToMessageId', () => {
    const reply = buildReply(makeDetail());
    expect(reply.to).toEqual(['alice@example.com']);
    expect(reply.subject).toBe('Re: 账单通知');
    expect(reply.replyToMessageId).toBe(42);
    expect(reply.fromAddress).toBe('me@hpc.email');
    expect(reply.isHtml).toBe(false);
    expect(reply.body).toContain('----- 原始邮件 -----');
    expect(reply.body).toContain('发件人：Alice <alice@example.com>');
    expect(reply.body).toContain('> 您的账单已生成');
  });

  it('已有 Re: 前缀时不重复叠加', () => {
    expect(buildReply(makeDetail({ subject: 'Re: 账单通知' })).subject).toBe('Re: 账单通知');
  });

  it('转发用 Fwd: 前缀、收件人留空、无 replyToMessageId', () => {
    const forward = buildForward(makeDetail());
    expect(forward.subject).toBe('Fwd: 账单通知');
    expect(forward.to).toEqual([]);
    expect(forward.replyToMessageId).toBeUndefined();
    expect(forward.body).toContain('----- 原始邮件 -----');
  });
});
