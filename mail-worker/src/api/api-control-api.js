import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import apiControlService from '../service/api-control-service';
import accountService from '../service/account-service';
import emailService from '../service/email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

function apiResponse(c, data, status = 200) {
	return c.json({ data: data ?? null, requestId: c.get('requestId') }, status);
}

function textToHtml(value) {
	return String(value || '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;')
		.replaceAll('\n', '<br>');
}

function parseList(value) {
	if (Array.isArray(value)) return value;
	if (typeof value !== 'string' || !value) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch (_) {
		return [];
	}
}

function messageStatus(value) {
	return ({
		[emailConst.status.RECEIVE]: 'received',
		[emailConst.status.SENT]: 'sent',
		[emailConst.status.DELIVERED]: 'delivered',
		[emailConst.status.BOUNCED]: 'bounced',
		[emailConst.status.COMPLAINED]: 'complained',
		[emailConst.status.DELAYED]: 'delayed',
		[emailConst.status.SAVING]: 'processing',
		[emailConst.status.FAILED]: 'failed'
	})[value] || 'unknown';
}

function mapMessage(row) {
	const recipients = parseList(row.recipient);
	if (!recipients.length && row.toEmail) recipients.push({ address: row.toEmail, name: row.toName || '' });
	return {
		id: row.emailId,
		direction: row.type === emailConst.type.SEND ? 'sent' : 'received',
		mailboxId: row.accountId || null,
		from: { address: row.sendEmail || '', name: row.name || '' },
		to: recipients.map(item => ({ address: item.address || '', name: item.name || '' })),
		subject: row.subject || '',
		text: row.text || '',
		html: row.content || '',
		verificationCode: row.code || null,
		status: messageStatus(row.status),
		read: row.unread === emailConst.unread.READ,
		messageId: row.messageId || null,
		inReplyTo: row.inReplyTo || null,
		createdAt: row.createTime,
		attachments: (row.attList || []).map(item => ({
			id: item.attId,
			filename: item.filename || '',
			contentType: item.mimeType || 'application/octet-stream',
			size: item.size || 0,
			path: item.key ? `/${item.key}` : null
		}))
	};
}

app.get('/apiKey/config', async c => c.json(result.ok(await apiControlService.config(c))));

app.put('/apiKey/setConfig', async c => {
	const data = await apiControlService.setConfig(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/apiKey/users', async c => c.json(result.ok(await apiControlService.userOptions(c))));

app.get('/apiKey/list', async c => c.json(result.ok(await apiControlService.list(c, c.req.query()))));

app.post('/apiKey/create', async c => {
	const data = await apiControlService.create(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.put('/apiKey/status', async c => {
	const data = await apiControlService.setStatus(c, await c.req.json());
	return c.json(result.ok(data));
});

app.delete('/apiKey/delete', async c => {
	await apiControlService.revoke(c, c.req.query('apiKeyId'));
	return c.json(result.ok());
});

app.get('/apiKey/audit', async c => c.json(result.ok(await apiControlService.audit(c, c.req.query()))));

app.use('/v1/*', async (c, next) => {
	const startedAt = Date.now();
	const requestedId = c.req.header('X-Request-ID') || '';
	const requestId = /^[A-Za-z0-9._:-]{1,100}$/.test(requestedId) ? requestedId : crypto.randomUUID();
	c.set('requestId', requestId);
	c.header('X-Request-ID', requestId);
	c.header('Cache-Control', 'no-store');
	let statusCode = 500;
	try {
		await apiControlService.authenticate(c);
		await next();
		statusCode = c.res.status;
	} catch (error) {
		statusCode = Number(error?.code) || 500;
		throw error;
	} finally {
		try {
			await apiControlService.recordAudit(c, statusCode, startedAt);
		} catch (error) {
			console.error('Failed to write API audit log', error);
		}
	}
});

app.get('/v1/status', async c => {
	const apiKey = c.get('apiKey');
	return apiResponse(c, {
		status: 'ok',
		apiVersion: 'v1',
		keyId: apiKey.apiKeyId,
		scopes: apiKey.scopes
	});
});

app.get('/v1/mailboxes', async c => {
	apiControlService.assertScope(c, 'mailbox.read');
	const userId = userContext.getUserId(c);
	const cursor = c.req.query('cursor') || '';
	const cursorMatch = cursor.match(/^(-?\d+):(\d+)$/);
	if (cursor && !cursorMatch) throw new BizError('Invalid mailbox cursor', 400);
	const size = Math.min(30, Math.max(1, Number(c.req.query('limit')) || 20));
	const list = await accountService.list(c, {
		accountId: cursorMatch ? Number(cursorMatch[2]) : 0,
		size,
		lastSort: cursorMatch ? Number(cursorMatch[1]) : Number.NaN
	}, userId);
	const last = list[list.length - 1];
	return apiResponse(c, {
		items: list.map(item => ({
			id: item.accountId,
			address: item.email,
			name: item.name,
			createdAt: item.createTime
		})),
		nextCursor: list.length === size ? `${last.sort}:${last.accountId}` : null
	});
});

app.get('/v1/messages', async c => {
	apiControlService.assertScope(c, 'mail.read');
	const query = c.req.query();
	const direction = query.direction === 'sent' ? 'sent' : 'received';
	const type = direction === 'sent' ? emailConst.type.SEND : emailConst.type.RECEIVE;
	const size = Math.min(50, Math.max(1, Number(query.limit) || 20));
	const cursor = Number(query.cursor) || 9999999999;
	const accountId = Number(query.mailboxId) || 0;
	const data = await emailService.list(c, {
		emailId: cursor,
		accountId,
		size,
		timeSort: 0,
		type
	}, userContext.getUserId(c));
	return apiResponse(c, {
		items: data.list.map(mapMessage),
		total: data.total,
		nextCursor: data.list.length === size ? data.list[data.list.length - 1].emailId : null
	});
});

app.get('/v1/messages/:emailId', async c => {
	apiControlService.assertScope(c, 'mail.read');
	const emailId = Number(c.req.param('emailId'));
	if (!Number.isInteger(emailId) || emailId < 1) throw new BizError('Invalid message id', 400);
	const message = await emailService.selectByIdForUser(c, emailId, userContext.getUserId(c));
	if (!message) throw new BizError('Message not found', 404);
	await emailService.emailAddAtt(c, [message]);
	return apiResponse(c, mapMessage(message));
});

app.post('/v1/messages', async c => {
	apiControlService.assertScope(c, 'mail.send', 'email:send');
	let body;
	try {
		body = await c.req.json();
	} catch (_) {
		throw new BizError('Request body must be valid JSON', 400);
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BizError('Invalid request body', 400);
	if (!Array.isArray(body.to)) throw new BizError('Message recipients must be an array', 400);
	if (typeof body.subject !== 'string' || body.subject.length > 998) throw new BizError('Invalid message subject', 400);
	if (body.text !== undefined && typeof body.text !== 'string') throw new BizError('Invalid text body', 400);
	if (body.html !== undefined && typeof body.html !== 'string') throw new BizError('Invalid HTML body', 400);
	const text = typeof body.text === 'string' ? body.text : '';
	const html = typeof body.html === 'string' && body.html ? body.html : `<p>${textToHtml(text)}</p>`;
	const sent = await emailService.send(c, {
		from: body.from,
		receiveEmail: body.to,
		subject: body.subject,
		text,
		content: html,
		attachments: body.attachments || [],
		sendType: ''
	}, userContext.getUserId(c));
	return apiResponse(c, mapMessage(sent[0]), 201);
});

app.all('/v1/*', async () => {
	throw new BizError('API endpoint not found', 404);
});
