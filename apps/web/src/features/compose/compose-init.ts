import type { MessageDetail } from '@hpc-mail/shared';
import { formatDateTime } from '@/lib/format';

/** 通过 router location.state 传给写邮件页的预填数据 */
export interface ComposeInitial {
  /** 期望的发件地址（本站 mailbox），用于预选身份 */
  fromAddress?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  isHtml?: boolean;
  /** 回复的站内邮件 id，后端据此注入 In-Reply-To / References */
  replyToMessageId?: number;
}

function withPrefix(subject: string, prefix: 'Re' | 'Fwd'): string {
  const trimmed = subject.trim();
  const pattern = prefix === 'Re' ? /^re:/i : /^(fwd?|转发):/i;
  return pattern.test(trimmed) ? trimmed : `${prefix}: ${trimmed}`;
}

function quotedBody(message: MessageDetail): string {
  const from = message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress;
  const header = [
    '',
    '',
    '----- 原始邮件 -----',
    `发件人：${from}`,
    `时间：${formatDateTime(message.createdAt)}`,
    `主题：${message.subject}`,
    '',
  ].join('\n');
  const source = message.bodyText.trim() || (message.bodyHtml ? '（原邮件为 HTML 内容，此处未引用）' : '');
  const quoted = source
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return `${header}\n${quoted}\n`;
}

export function buildReply(message: MessageDetail): ComposeInitial {
  return {
    fromAddress: message.address,
    to: [message.fromAddress],
    subject: withPrefix(message.subject, 'Re'),
    body: quotedBody(message),
    isHtml: false,
    replyToMessageId: message.id,
  };
}

export function buildForward(message: MessageDetail): ComposeInitial {
  return {
    fromAddress: message.address,
    to: [],
    subject: withPrefix(message.subject, 'Fwd'),
    body: quotedBody(message),
    isHtml: false,
  };
}
