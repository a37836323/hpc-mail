import { bytesToHex } from '../lib/crypto.js';
import type { Env } from '../types.js';

/** 正文溢出：完整 JSON 落 R2 */
export function bodyKey(): string {
  return `body/${crypto.randomUUID()}.json`;
}

export function attachmentKey(
  messageId: number,
  seq: number,
  hash16: string,
  ext: string,
): string {
  return `att/${messageId}/${seq}_${hash16}${ext}`;
}

export async function sha256Hex16(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest)).slice(0, 16);
}

export function getExt(filename: string | undefined | null): string {
  const name = String(filename || '');
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  const ext = name.slice(dot).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

export async function putJson(env: Env, key: string, obj: unknown): Promise<void> {
  await env.r2.put(key, JSON.stringify(obj), {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function getJson<T>(env: Env, key: string): Promise<T | null> {
  const obj = await env.r2.get(key);
  if (!obj) return null;
  return (await obj.json()) as T;
}

export async function putObject(
  env: Env,
  key: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await env.r2.put(key, body, { httpMetadata: { contentType } });
}

export async function getObject(env: Env, key: string): Promise<R2ObjectBody | null> {
  return env.r2.get(key);
}

/** 删除某消息的全部 R2 对象（附件前缀 + 正文溢出 key） */
export async function deleteMessageObjects(
  env: Env,
  messageId: number,
  bodyR2Key: string | null,
): Promise<void> {
  const prefix = `att/${messageId}/`;
  try {
    const listed = await env.r2.list({ prefix });
    if (listed.objects.length) {
      await env.r2.delete(listed.objects.map((o) => o.key));
    }
  } catch (e) {
    console.error('删除附件 R2 失败:', e);
  }
  if (bodyR2Key) {
    try {
      await env.r2.delete(bodyR2Key);
    } catch (e) {
      console.error('删除正文 R2 失败:', e);
    }
  }
}
