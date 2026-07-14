import { SECRET_MASK } from '@hpc-mail/shared';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { messages, users } from '../src/db/schema.js';
import { AppError } from '../src/lib/errors.js';
import { claimMailbox } from '../src/services/mailbox.js';
import { listMessages } from '../src/services/message.js';
import { getSettings, maskSettings, updateSettings } from '../src/services/setting.js';

async function seedUser(username: string, role: 'admin' | 'user'): Promise<number> {
  const db = createDb(env);
  const [row] = await db
    .insert(users)
    .values({ username, passwordHash: 'x', role, status: 'active' })
    .returning({ id: users.id });
  return row!.id;
}

async function seedInbound(address: string, subject: string): Promise<void> {
  const db = createDb(env);
  await db.insert(messages).values({
    direction: 'inbound',
    address,
    domain: address.split('@')[1]!,
    fromAddress: 'sender@example.com',
    fromName: 'Sender',
    subject,
    status: 'received',
    createdAt: new Date(),
  });
}

describe('settings 脱敏与掩码写入', () => {
  it('resend token 存明文、回显掩码、掩码提交保留旧值', async () => {
    await updateSettings(env, { resend: { tokens: { 'hpc.email': 're_secret_abc' } } });
    let settings = await getSettings(env);
    expect(settings.resend.tokens['hpc.email']).toBe('re_secret_abc');
    expect(maskSettings(settings).resend.tokens['hpc.email']).toBe(SECRET_MASK);

    // 提交掩码 → 保留旧值
    await updateSettings(env, { resend: { tokens: { 'hpc.email': SECRET_MASK } } });
    settings = await getSettings(env);
    expect(settings.resend.tokens['hpc.email']).toBe('re_secret_abc');

    // 提交空串 → 删除
    await updateSettings(env, { resend: { tokens: { 'hpc.email': '' } } });
    settings = await getSettings(env);
    expect(settings.resend.tokens['hpc.email']).toBeUndefined();
  });

  it('feishu secret 掩码提交保留旧值', async () => {
    const webhookUrl = 'https://open.feishu.cn/open-apis/bot/v2/hook/abcdefghijklmnop';
    await updateSettings(env, { feishu: { enabled: true, webhookUrl, secret: 's3cr3t' } });
    let settings = await getSettings(env);
    expect(settings.feishu.secret).toBe('s3cr3t');
    expect(maskSettings(settings).feishu.secret).toBe(SECRET_MASK);

    await updateSettings(env, { feishu: { enabled: true, webhookUrl, secret: SECRET_MASK } });
    settings = await getSettings(env);
    expect(settings.feishu.secret).toBe('s3cr3t');
  });
});

describe('mailbox 认领唯一冲突', () => {
  it('同地址二次认领被拒，跨域名被拒', async () => {
    const u1 = await seedUser('alice', 'user');
    const u2 = await seedUser('bob', 'user');
    const box = await claimMailbox(env, u1, { localPart: 'test1', domain: 'claude-router.cc' });
    expect(box.address).toBe('test1@claude-router.cc');

    await expect(
      claimMailbox(env, u2, { localPart: 'test1', domain: 'claude-router.cc' }),
    ).rejects.toThrow(AppError);

    await expect(
      claimMailbox(env, u1, { localPart: 'x', domain: 'not-a-system-domain.com' }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});

describe('message 可见性 user vs admin', () => {
  beforeEach(async () => {
    await seedInbound('test1@claude-router.cc', 'claimed message');
    await seedInbound('other@hpc.email', 'unclaimed message');
  });

  it('user 只看自己认领地址', async () => {
    const uid = await seedUser('carol', 'user');
    await claimMailbox(env, uid, { localPart: 'test1', domain: 'claude-router.cc' });
    const page = await listMessages(
      env,
      { userId: uid, role: 'user' },
      { limit: 30 } as never,
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.address).toBe('test1@claude-router.cc');
  });

  it('admin 默认看全站，scope=mine 只看自己', async () => {
    const adminId = await seedUser('root', 'admin');
    const all = await listMessages(env, { userId: adminId, role: 'admin' }, { limit: 30 } as never);
    expect(all.items.length).toBeGreaterThanOrEqual(2);

    const mine = await listMessages(
      env,
      { userId: adminId, role: 'admin', scope: 'mine' },
      { limit: 30 } as never,
    );
    expect(mine.items).toHaveLength(0);
  });
});
