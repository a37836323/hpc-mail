import { updateNotifyPrefsRequestSchema } from '@hpc-mail/shared';
import { Hono } from 'hono';
import { ok, parseBody } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { sendFeishuNotification } from '../services/feishu.js';
import {
  getUserNotifyPrefs,
  maskUserNotifyPrefs,
  updateUserNotifyPrefs,
} from '../services/notify-prefs.js';
import type { AppContext } from '../types.js';

const app = new Hono<AppContext>();
app.use('*', requireAuth);

/** 读个人转发/通知偏好（secret 掩码回显） */
app.get('/', async (c) => {
  const user = c.get('user')!;
  const prefs = await getUserNotifyPrefs(c.env, user.id);
  return ok(c, maskUserNotifyPrefs(prefs));
});

/** 写个人转发/通知偏好 */
app.put('/', async (c) => {
  const user = c.get('user')!;
  const req = await parseBody(c, updateNotifyPrefsRequestSchema);
  const prefs = await updateUserNotifyPrefs(c.env, user.id, req);
  return ok(c, maskUserNotifyPrefs(prefs));
});

/** 用当前保存的个人飞书配置发一张测试卡片 */
app.post('/feishu-test', async (c) => {
  const user = c.get('user')!;
  const prefs = await getUserNotifyPrefs(c.env, user.id);
  await sendFeishuNotification(
    prefs.feishu,
    {
      subject: 'HPC Mail 飞书机器人测试',
      fromAddress: 'system@hpc.email',
      fromName: 'HPC Mail',
      toAddress: user.username,
      code: '',
      body: '配置有效。今后你认领地址收到的新邮件会把正文推送到此机器人。',
    },
    { force: true, throwOnError: true, test: true },
  );
  return ok(c, { ok: true });
});

export default app;
