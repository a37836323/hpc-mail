import { LOCAL_PART_REGEX } from '@hpc-mail/shared';
import { AppError } from './errors.js';

/** 断言头部无换行注入（用于 from 各字段） */
export function assertNoHeaderInjection(value: string | undefined | null): void {
  if (typeof value === 'string' && /[\r\n]/.test(value)) {
    throw new AppError('validation_failed', '邮件头包含非法字符');
  }
}

export function normalizeDomain(domain: string | undefined | null): string {
  if (typeof domain !== 'string') return '';
  return domain.trim().replace(/^@/, '').toLowerCase();
}

export function normalizeEmail(email: string | undefined | null): string {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

export function getLocalPart(email: string): string {
  const at = email.indexOf('@');
  return at >= 0 ? email.slice(0, at) : email;
}

export function getEmailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1) : '';
}

/** 从地址取展示名兜底（local part） */
export function getNameFromEmail(email: string): string {
  return getLocalPart(normalizeEmail(email));
}

/** 校验 local part 归一化合法性（配合 shared LOCAL_PART_REGEX） */
export function validateLocalPart(localPart: string): string {
  const normalized = normalizeEmail(localPart);
  assertNoHeaderInjection(normalized);
  if (!LOCAL_PART_REGEX.test(normalized)) {
    throw new AppError('validation_failed', '邮箱前缀非法');
  }
  return normalized;
}
