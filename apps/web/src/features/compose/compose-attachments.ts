import { EXTERNAL_MESSAGE_MAX_BYTES } from '@hpc-mail/shared';

/**
 * 收件人里是否存在系统域名之外的外部地址（决定是否触发 send_email 5MiB 外发限制）。
 * 格式非法（无 @）按外部处理，保守拦截。
 */
export function hasExternalRecipient(addrs: string[], domains: string[]): boolean {
  return addrs.some((addr) => {
    const d = addr.split('@')[1]?.toLowerCase();
    return !d || !domains.includes(d);
  });
}

/** 外发邮件近似字节数：附件按 base64 膨胀 4/3 + 正文字节（与后端 sendMail 口径一致） */
export function estimateExternalMessageBytes(attBytes: number, bodyBytes: number): number {
  return Math.ceil((attBytes * 4) / 3) + bodyBytes;
}

/** 外发是否超 5MiB 阈值（Cloudflare send_email 单封邮件含附件硬限，留余量到 4MiB） */
export function exceedsExternalLimit(attBytes: number, bodyBytes: number): boolean {
  return estimateExternalMessageBytes(attBytes, bodyBytes) > EXTERNAL_MESSAGE_MAX_BYTES;
}
