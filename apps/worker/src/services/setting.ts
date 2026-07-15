import {
  DEFAULT_SETTINGS,
  SECRET_MASK,
  SETTING_SCHEMAS,
  type SettingKey,
  type Settings,
  type UpdateSettingsRequest,
} from '@hpc-mail/shared';
import { createDb } from '../db/client.js';
import { settings as settingsTable } from '../db/schema.js';
import type { Env } from '../types.js';

const CACHE_KEY = 'setting-cache';
const CACHE_TTL_SECONDS = 60;

/** 从 D1 读全部设置并与默认值合并（逐 key safeParse，非法回落默认） */
async function loadFromDb(env: Env): Promise<Settings> {
  const db = createDb(env);
  const rows = await db.select().from(settingsTable).all();
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const merged = { ...DEFAULT_SETTINGS } as Settings;
  for (const key of Object.keys(SETTING_SCHEMAS) as SettingKey[]) {
    const raw = stored.get(key);
    if (raw === undefined) continue;
    try {
      const parsed = SETTING_SCHEMAS[key].safeParse(JSON.parse(raw));
      if (parsed.success) (merged as Record<string, unknown>)[key] = parsed.data;
    } catch {
      // 非法值忽略，保留默认
    }
  }
  return merged;
}

/** 读设置（KV 缓存 60s，失败降级直读 DB，再失败用默认值——收件不因配置故障丢信） */
export async function getSettings(env: Env): Promise<Settings> {
  try {
    const cached = await env.kv.get(CACHE_KEY, { type: 'json' });
    if (cached) return cached as Settings;
  } catch {
    // 缓存读失败，继续直读 DB
  }
  try {
    const fresh = await loadFromDb(env);
    try {
      await env.kv.put(CACHE_KEY, JSON.stringify(fresh), { expirationTtl: CACHE_TTL_SECONDS });
    } catch {
      // 缓存写失败无所谓
    }
    return fresh;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function invalidateSettingsCache(env: Env): Promise<void> {
  try {
    await env.kv.delete(CACHE_KEY);
  } catch {
    // ignore
  }
}

/** 写设置：处理 SECRET_MASK 保留旧值，逐 key 校验后落库并失效缓存 */
export async function updateSettings(env: Env, patch: UpdateSettingsRequest): Promise<void> {
  const current = await loadFromDb(env);
  const db = createDb(env);
  const writes: { key: string; value: string }[] = [];

  for (const key of Object.keys(patch) as SettingKey[]) {
    const incoming = patch[key];
    if (incoming === undefined) continue;
    let next: unknown = incoming;

    if (key === 'feishu') {
      const incomingFeishu = incoming as Settings['feishu'];
      next = {
        ...incomingFeishu,
        secret: incomingFeishu.secret === SECRET_MASK ? current.feishu.secret : incomingFeishu.secret,
      };
    } else if (key === 'notify_webhook') {
      const inc = incoming as Settings['notify_webhook'];
      next = {
        ...inc,
        secret: inc.secret === SECRET_MASK ? current.notify_webhook.secret : inc.secret,
      };
    }

    const parsed = SETTING_SCHEMAS[key].safeParse(next);
    if (!parsed.success) continue;
    writes.push({ key, value: JSON.stringify(parsed.data) });
  }

  for (const w of writes) {
    await db
      .insert(settingsTable)
      .values(w)
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: w.value } });
  }
  await invalidateSettingsCache(env);
}

/** 管理端回显脱敏：feishu / notify_webhook secret 用 SECRET_MASK（保留 configured 状态） */
export function maskSettings(settings: Settings): Settings {
  return {
    ...settings,
    feishu: {
      ...settings.feishu,
      secret: settings.feishu.secret ? SECRET_MASK : '',
    },
    notify_webhook: {
      ...settings.notify_webhook,
      secret: settings.notify_webhook.secret ? SECRET_MASK : '',
    },
  };
}
