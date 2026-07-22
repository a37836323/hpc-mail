import type { Settings } from '@hpc-mail/shared';
import type { Env } from '../types.js';
import { getSettings } from './setting.js';

/**
 * 全部系统域名名（管理员可用范围）：完全由 settings.domains.list 决定（管理端维护，无写死 fallback）。
 * 收件人分组 / 发件校验 / 可用性检查 / 认领「是否系统域名」判定都走这里，保证同一来源。
 * 未配置任何域名时返回空数组——此时认领/发件全部被拒，需管理员先在设置里加域名。
 */
export async function getDomains(env: Env, settings?: Settings): Promise<string[]> {
  const s = settings ?? (await getSettings(env));
  return s.domains.list.map((e) => e.domain);
}

/** 系统通知（登录告警/测试卡片等）展示用的发件地址：取首个已配域名，未配置时回退 localhost。 */
export async function getSystemFromAddress(env: Env): Promise<string> {
  const [first] = await getDomains(env);
  return `system@${first ?? 'localhost'}`;
}

/** 对普通用户公开的域名子集（可见 + 可认领）；管理员不受此限。 */
export async function getPublicDomains(env: Env, settings?: Settings): Promise<string[]> {
  const s = settings ?? (await getSettings(env));
  return s.domains.list.filter((e) => e.public).map((e) => e.domain);
}

/** 按角色返回可见域名：管理员=全部，普通用户=公开子集。 */
export async function getVisibleDomains(
  env: Env,
  isAdmin: boolean,
  settings?: Settings,
): Promise<string[]> {
  return isAdmin ? getDomains(env, settings) : getPublicDomains(env, settings);
}

/** 域名是否对普通用户公开。 */
export function isDomainPublic(settings: Settings, domain: string): boolean {
  return settings.domains.list.some((e) => e.domain === domain && e.public);
}

/** 该域名下每个普通用户的认领上限（0=不限，仅受全局上限约束）。 */
export function domainPerUserLimit(settings: Settings, domain: string): number {
  return settings.domains.list.find((e) => e.domain === domain)?.perUserLimit ?? 0;
}
