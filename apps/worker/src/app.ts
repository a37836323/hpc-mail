import { Hono } from 'hono';
import { onError, requestId } from './middleware/error.js';
import adminApiKeys from './routes/admin/api-keys.js';
import adminInvites from './routes/admin/invites.js';
import adminSettings from './routes/admin/settings.js';
import adminUsers from './routes/admin/users.js';
import apiKeys from './routes/api-keys.js';
import attachments from './routes/attachments.js';
import auth from './routes/auth.js';
import avatar from './routes/avatar.js';
import config from './routes/config.js';
import mailboxes from './routes/mailboxes.js';
import messages from './routes/messages.js';
import v1 from './routes/v1/index.js';
import webhooks from './routes/webhooks.js';
import type { AppContext } from './types.js';

export function createApp() {
  const app = new Hono<AppContext>();
  app.use('*', requestId);
  app.onError(onError);

  const api = new Hono<AppContext>();
  api.route('/auth', auth);
  api.route('/avatar', avatar);
  api.route('/config', config);
  api.route('/mailboxes', mailboxes);
  api.route('/messages', messages);
  api.route('/attachments', attachments);
  api.route('/api-keys', apiKeys);
  api.route('/webhooks', webhooks);
  api.route('/admin/users', adminUsers);
  api.route('/admin/settings', adminSettings);
  api.route('/admin/invites', adminInvites);
  api.route('/admin/api-keys', adminApiKeys);

  app.route('/api', api);
  app.route('/v1', v1);

  return app;
}

export type App = ReturnType<typeof createApp>;
