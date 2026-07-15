import { domainSchema, updateSettingsRequestSchema } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { AppError } from '../../lib/errors.js';
import { clientIp, ok, parseBody } from '../../lib/http.js';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import { logAdminAction } from '../../services/audit.js';
import { checkDomainOnboarding } from '../../services/domain-check.js';
import { sendFeishuNotification } from '../../services/feishu.js';
import { getSettings, maskSettings, updateSettings } from '../../services/setting.js';
import type { AppContext } from '../../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth, requireAdmin);

/** 回显脱敏（feishu / webhook secret 掩码） */
app.get('/', async (c) => {
  const settings = await getSettings(c.env);
  return ok(c, maskSettings(settings));
});

app.put('/', async (c) => {
  const acting = c.get('user')!;
  const req = await parseBody(c, updateSettingsRequestSchema);
  await updateSettings(c.env, req);
  await logAdminAction(c.env, acting, 'settings.update', Object.keys(req).join('、'), '', clientIp(c));
  const settings = await getSettings(c.env);
  return ok(c, maskSettings(settings));
});

/** 域名接入自检：DoH 探测该域 MX 是否已指向 Cloudflare Email Routing（无需 CF 凭据） */
app.get('/domain-status', async (c) => {
  const parsed = domainSchema.safeParse((c.req.query('domain') ?? '').trim().toLowerCase());
  if (!parsed.success) throw new AppError('validation_failed', '域名格式非法');
  const settings = await getSettings(c.env);
  const inList = settings.domains.list.some((e) => e.domain === parsed.data);
  const status = await checkDomainOnboarding(parsed.data, inList);
  return ok(c, status);
});

/** 用当前保存的飞书配置发一张测试卡片 */
app.post('/feishu-test', async (c) => {
  const settings = await getSettings(c.env);
  await sendFeishuNotification(
    c.env,
    settings,
    {
      subject: 'HPC Mail 飞书机器人测试',
      fromAddress: 'system@hpc.email',
      fromName: 'HPC Mail',
      toAddress: 'configured-mailbox',
      code: '',
      body: '配置有效。今后符合规则的新邮件会把完整正文推送到此机器人。',
    },
    { force: true, throwOnError: true, test: true },
  );
  return ok(c, { ok: true });
});

export default app;
