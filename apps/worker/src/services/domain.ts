import type { Settings } from '@hpc-mail/shared';
import type { Env } from '../types.js';
import { getSettings } from './setting.js';

/**
 * 有效系统域名：完全由 settings.domains.list 决定（管理端维护，无写死 fallback）。
 * 收件人分组 / 认领白名单 / 发件校验 / 公开配置全部走这里，保证同一来源。
 * 未配置任何域名时返回空数组——此时认领/发件全部被拒，需管理员先在设置里加域名。
 */
export async function getDomains(env: Env, settings?: Settings): Promise<string[]> {
  const s = settings ?? (await getSettings(env));
  return s.domains.list;
}
