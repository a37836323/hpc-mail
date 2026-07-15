import { SECRET_MASK } from '@hpc-mail/shared';
import { env } from 'cloudflare:test';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { messages, users } from '../src/db/schema.js';
import { AppError } from '../src/lib/errors.js';
import { getDomains } from '../src/services/domain.js';
import { claimMailbox } from '../src/services/mailbox.js';
import { listMessages, starMessages } from '../src/services/message.js';
import { sendMail } from '../src/services/outbound.js';
import { getSettings, maskSettings, updateSettings } from '../src/services/setting.js';

async function seedUser(username: string, role: 'admin' | 'user'): Promise<number> {
  const db = createDb(env);
  const [row] = await db
    .insert(users)
    .values({ username, passwordHash: 'x', role, status: 'active' })
    .returning({ id: users.id });
  return row!.id;
}

async function seedInbound(address: string, subject: string, bodyText = ''): Promise<number> {
  const db = createDb(env);
  const [row] = await db
    .insert(messages)
    .values({
      direction: 'inbound',
      address,
      domain: address.split('@')[1]!,
      fromAddress: 'sender@example.com',
      fromName: 'Sender',
      subject,
      bodyText,
      status: 'received',
      createdAt: new Date(),
    })
    .returning({ id: messages.id });
  return row!.id;
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
  // 地址与「认领唯一冲突」用例错开——同文件共享存储，test1@ 已被 alice 占用
  beforeEach(async () => {
    await seedInbound('carol@claude-router.cc', 'claimed message');
    await seedInbound('other@hpc.email', 'unclaimed message');
  });

  it('user 只看自己认领地址', async () => {
    const uid = await seedUser('carol', 'user');
    await claimMailbox(env, uid, { localPart: 'carol', domain: 'claude-router.cc' });
    const page = await listMessages(
      env,
      { userId: uid, role: 'user' },
      { limit: 30 } as never,
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.address).toBe('carol@claude-router.cc');
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

describe('星标与正文搜索', () => {
  it('星标为每用户独立，starred 过滤与 isStarred 标记生效', async () => {
    const admin = await seedUser('star-admin', 'admin');
    const other = await seedUser('star-other', 'admin');
    const mid = await seedInbound('star@hpc.email', 'hello star');

    await starMessages(env, { userId: admin, role: 'admin' }, [mid], true);

    const adminList = await listMessages(env, { userId: admin, role: 'admin' }, { limit: 30 } as never);
    const starredForAdmin = adminList.items.find((m) => m.id === mid);
    expect(starredForAdmin?.isStarred).toBe(true);

    // 另一个用户看到的同一封邮件未被星标
    const otherList = await listMessages(env, { userId: other, role: 'admin' }, { limit: 30 } as never);
    expect(otherList.items.find((m) => m.id === mid)?.isStarred).toBe(false);

    // starred=true 过滤只返回星标邮件
    const onlyStarred = await listMessages(
      env,
      { userId: admin, role: 'admin' },
      { limit: 30, starred: true } as never,
    );
    expect(onlyStarred.items.every((m) => m.isStarred)).toBe(true);
    expect(onlyStarred.items.some((m) => m.id === mid)).toBe(true);

    // 取消星标
    await starMessages(env, { userId: admin, role: 'admin' }, [mid], false);
    const afterUnstar = await listMessages(
      env,
      { userId: admin, role: 'admin' },
      { limit: 30, starred: true } as never,
    );
    expect(afterUnstar.items.some((m) => m.id === mid)).toBe(false);
  });

  it('q 搜索命中正文 bodyText', async () => {
    const admin = await seedUser('search-admin', 'admin');
    await seedInbound('s1@hpc.email', '普通主题', '这里有一个 UNIQUETOKEN9 在正文里');
    await seedInbound('s2@hpc.email', '另一封', '无关内容');

    const hit = await listMessages(
      env,
      { userId: admin, role: 'admin' },
      { limit: 30, q: 'UNIQUETOKEN9' } as never,
    );
    expect(hit.items).toHaveLength(1);
    expect(hit.items[0]!.address).toBe('s1@hpc.email');
  });
});

describe('动态域名 getDomains', () => {
  it('无 domains 设置时 fallback 到 env.domain', async () => {
    const domains = await getDomains(env);
    expect(domains).toEqual(env.domain);
    expect(domains).toContain('hpc.email');
  });

  it('settings.domains.list 非空时覆盖 env.domain，可认领新域名、拒绝表外域名', async () => {
    await updateSettings(env, { domains: { list: ['custom-domain.io', 'hpc.email'] } });
    expect(await getDomains(env)).toEqual(['custom-domain.io', 'hpc.email']);

    const uid = await seedUser('dom-user', 'user');
    const box = await claimMailbox(env, uid, { localPart: 'hi', domain: 'custom-domain.io' });
    expect(box.address).toBe('hi@custom-domain.io');

    // 覆盖后，原本在 env.domain 但不在 list 的域名被拒
    await expect(
      claimMailbox(env, uid, { localPart: 'x', domain: 'riba2534.cn' }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});

describe('回复头 replyToMessageId', () => {
  it('站内回复时 outbound 与 inbound 行写入原邮件 message_id 到 in_reply_to', async () => {
    const db = createDb(env);
    const uid = await seedUser('reply-user', 'user');
    await claimMailbox(env, uid, { localPart: 'me', domain: 'hpc.email' });
    const [orig] = await db
      .insert(messages)
      .values({
        direction: 'inbound',
        address: 'me@hpc.email',
        domain: 'hpc.email',
        fromAddress: 'ext@example.com',
        subject: 'Original',
        messageId: '<orig-abc@example.com>',
        status: 'received',
        createdAt: new Date(),
      })
      .returning({ id: messages.id });

    const ctx = { waitUntil: () => {} };
    await sendMail(env, ctx, { userId: uid, role: 'user' }, {
      from: { localPart: 'me', domain: 'hpc.email' },
      to: ['friend@hpc.email'],
      cc: [],
      bcc: [],
      subject: 'Re: Original',
      text: '回复内容',
      attachments: [],
      replyToMessageId: orig!.id,
    } as never);

    const outbound = await db
      .select()
      .from(messages)
      .where(and(eq(messages.direction, 'outbound'), eq(messages.address, 'me@hpc.email')))
      .get();
    expect(outbound?.inReplyTo).toBe('<orig-abc@example.com>');

    const internal = await db
      .select()
      .from(messages)
      .where(and(eq(messages.direction, 'inbound'), eq(messages.address, 'friend@hpc.email')))
      .get();
    expect(internal?.inReplyTo).toBe('<orig-abc@example.com>');
  });
});
