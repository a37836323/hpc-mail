import { updateSettingsRequestSchema } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { ok, parseBody } from '../../lib/http.js';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import { sendFeishuNotification } from '../../services/feishu.js';
import { getSettings, maskSettings, updateSettings } from '../../services/setting.js';
import type { AppContext } from '../../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth, requireAdmin);

/** 回显脱敏（resend token / feishu secret 掩码） */
app.get('/', async (c) => {
  const settings = await getSettings(c.env);
  return ok(c, maskSettings(settings));
});

app.put('/', async (c) => {
  const req = await parseBody(c, updateSettingsRequestSchema);
  await updateSettings(c.env, req);
  const settings = await getSettings(c.env);
  return ok(c, maskSettings(settings));
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
      preview: '配置有效。今后符合规则的新邮件会推送到此机器人。',
    },
    { force: true, throwOnError: true, test: true },
  );
  return ok(c, { ok: true });
});

export default app;
