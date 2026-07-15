import type { Settings } from '@hpc-mail/shared';
import { hmacSha256Base64 } from '../lib/crypto.js';

// 阻止指向内网/回环的 host（基础 SSRF 防护；仅 admin 可配，DNS-rebinding 残余风险接受）
const BLOCKED_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|fe80)/i;

/** 校验通用 webhook URL：必须 https 且非内网 host */
export function validateNotifyWebhookUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (BLOCKED_HOST.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export interface WebhookMailPayload {
  event: 'mail.received';
  message: {
    id: number;
    address: string;
    fromAddress: string;
    fromName: string;
    subject: string;
    verificationCode: string;
    preview: string;
    createdAt: string;
  };
}

/** 新邮件通用 webhook 推送（HMAC-SHA256 签名于 X-HPC-Signature，10s 超时，静默失败） */
export async function sendNotifyWebhook(
  settings: Settings,
  payload: WebhookMailPayload,
): Promise<void> {
  const cfg = settings.notify_webhook;
  if (!cfg.enabled || !cfg.url) return;
  const url = validateNotifyWebhookUrl(cfg.url);
  if (!url) return;
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.secret) {
    headers['X-HPC-Signature'] = await hmacSha256Base64(new TextEncoder().encode(cfg.secret), body);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    await fetch(url.toString(), {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch (e) {
    console.error('通用 webhook 推送失败:', e instanceof Error ? e.message : e);
  } finally {
    clearTimeout(timeout);
  }
}
