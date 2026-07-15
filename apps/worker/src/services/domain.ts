import type { Settings } from '@hpc-mail/shared';
import type { Env } from '../types.js';
import { getSettings } from './setting.js';

/**
 * 有效系统域名：settings.domains.list 非空则用之，否则 fallback 到 wrangler vars 的 env.domain。
 * 收件人分组 / 认领白名单 / 发件校验 / 公开配置全部走这里，保证同一来源。
 */
export async function getDomains(env: Env, settings?: Settings): Promise<string[]> {
  const s = settings ?? (await getSettings(env));
  const list = s.domains.list;
  return list.length > 0 ? list : env.domain;
}
