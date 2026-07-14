import { ERROR_STATUS, type ErrorCode } from '@hpc-mail/shared';

/** 业务错误：code 决定 HTTP 状态与响应错误码 */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'AppError';
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}
