import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import apiControlService from '../service/api-control-service';
import accountService from '../service/account-service';
import emailService from '../service/email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import userService from '../service/user-service';
import roleService from '../service/role-service';
import r2Service from '../service/r2-service';
import { configuredDomains, hasDomainPermission } from '../utils/sender-utils';
import { isAdminRole } from '../utils/auth-utils';

const MAX_API_REQUEST_BYTES = 40 * 1024 * 1024;
const MAX_MESSAGE_BODY_BYTES = 5 * 1024 * 1024;
const MAX_RECIPIENTS = 50;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const encoder = new TextEncoder();

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

function parsePositiveInteger(value, fieldName, { allowEmpty = true } = {}) {
	if ((value === undefined || value === '') && allowEmpty) return null;
	if (!/^\d+$/.test(String(value))) throw new BizError(`Invalid ${fieldName}`, 400);
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) throw new BizError(`Invalid ${fieldName}`, 400);
	return parsed;
}

function parseLimit(value, fallback, maximum) {
	if (value === undefined || value === '') return fallback;
	const parsed = parsePositiveInteger(value, 'limit', { allowEmpty: false });
	return Math.min(parsed, maximum);
}

async function parseJsonBody(c) {
	const contentLength = Number(c.req.header('Content-Length'));
	if (Number.isFinite(contentLength) && contentLength > MAX_API_REQUEST_BYTES) {
		throw new BizError('Request body is too large', 413);
	}
	const raw = await c.req.text();
	if (encoder.encode(raw).byteLength > MAX_API_REQUEST_BYTES) {
		throw new BizError('Request body is too large', 413);
	}
	try {
		return JSON.parse(raw);
	} catch (_) {
		throw new BizError('Request body must be valid JSON', 400);
	}
}

function estimateBase64Bytes(content) {
	const value = String(content || '').replace(/\s+/g, '');
	if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
		throw new BizError('Attachment content must be valid base64', 400);
	}
	const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
	return Math.max(0, value.length * 3 / 4 - padding);
}

function normalizeApiAttachments(value) {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) {
		throw new BizError(`A message supports at most ${MAX_ATTACHMENTS} attachments`, 400);
	}
	let totalSize = 0;
	return value.map(item => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			throw new BizError('Invalid attachment', 400);
		}
		const allowed = new Set(['filename', 'contentType', 'content']);
		if (Object.keys(item).some(key => !allowed.has(key))) {
			throw new BizError('Attachment contains unsupported fields', 400);
		}
		const filename = typeof item.filename === 'string' ? item.filename.trim() : '';
		if (!filename || filename.length > 255 || filename === '.' || filename === '..' || /[\\/\u0000-\u001f\u007f]/.test(filename)) {
			throw new BizError('Invalid attachment filename', 400);
		}
		const contentType = typeof item.contentType === 'string' ? item.contentType.trim().toLowerCase() : '';
		if (!contentType || contentType.length > 127 || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(contentType)) {
			throw new BizError('Invalid attachment content type', 400);
		}
		if (typeof item.content !== 'string') throw new BizError('Attachment content must be base64 text', 400);
		const size = estimateBase64Bytes(item.content);
		if (size > MAX_ATTACHMENT_BYTES) throw new BizError('Attachment exceeds the 25 MiB limit', 413);
		totalSize += size;
		if (totalSize > MAX_TOTAL_ATTACHMENT_BYTES) throw new BizError('Attachments exceed the 25 MiB total limit', 413);
		return { filename, type: contentType, content: item.content.replace(/\s+/g, '') };
	});
}

function normalizeRecipients(value) {
	if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RECIPIENTS) {
		throw new BizError(`Message recipients must contain 1 to ${MAX_RECIPIENTS} addresses`, 400);
	}
	const unique = new Map();
	for (const item of value) {
		if (typeof item !== 'string' || !item.trim()) throw new BizError('Invalid message recipient', 400);
		const address = item.trim();
		unique.set(address.toLowerCase(), address);
	}
	return [...unique.values()];
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
			downloadUrl: item.attId ? `/api/v1/messages/${row.emailId}/attachments/${item.attId}` : null
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
	apiControlService.assertScope(c, 'mailbox.read', 'account:query');
	const userId = userContext.getUserId(c);
	const cursor = c.req.query('cursor') || '';
	const cursorMatch = cursor.match(/^(-?\d+):(\d+)$/);
	if (cursor && !cursorMatch) throw new BizError('Invalid mailbox cursor', 400);
	const size = parseLimit(c.req.query('limit'), 20, 30);
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

app.get('/v1/domains', async c => {
	apiControlService.assertScope(c, 'mail.send', 'email:send');
	const userRow = await userService.selectById(c, userContext.getUserId(c));
	const roleRow = userRow ? await roleService.selectById(c, userRow.type) : null;
	if (!userRow || !roleRow) throw new BizError('API key user is unavailable', 403);
	const domains = configuredDomains(c.env.domain).filter(domain => (
		isAdminRole(roleRow) || hasDomainPermission(roleRow.availDomain, domain)
	));
	return apiResponse(c, { items: domains });
});

app.get('/v1/messages', async c => {
	apiControlService.assertScope(c, 'mail.read');
	const query = c.req.query();
	const direction = query.direction || 'received';
	if (!['received', 'sent'].includes(direction)) throw new BizError('Invalid message direction', 400);
	const type = direction === 'sent' ? emailConst.type.SEND : emailConst.type.RECEIVE;
	const size = parseLimit(query.limit, 20, 50);
	const cursor = parsePositiveInteger(query.cursor, 'message cursor') || 9999999999;
	const accountId = parsePositiveInteger(query.mailboxId, 'mailbox id') || 0;
	if (direction === 'sent' && accountId) throw new BizError('Mailbox filter is only available for received messages', 400);
	if (accountId) {
		const mailbox = await accountService.selectById(c, accountId);
		if (!mailbox || mailbox.userId !== userContext.getUserId(c)) throw new BizError('Mailbox not found', 404);
	}
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

app.get('/v1/messages/:emailId/attachments/:attachmentId', async c => {
	apiControlService.assertScope(c, 'mail.read');
	const emailId = parsePositiveInteger(c.req.param('emailId'), 'message id', { allowEmpty: false });
	const attachmentId = parsePositiveInteger(c.req.param('attachmentId'), 'attachment id', { allowEmpty: false });
	const attachment = await c.env.db.prepare(`
		SELECT a.key
		FROM attachments a
		JOIN email e ON e.email_id = a.email_id
		WHERE a.att_id = ? AND a.email_id = ? AND a.user_id = ? AND e.user_id = ? AND e.is_del = 0
	`).bind(attachmentId, emailId, userContext.getUserId(c), userContext.getUserId(c)).first();
	if (!attachment?.key) throw new BizError('Attachment not found', 404);
	const response = await r2Service.toSafeResponse(c, attachment.key);
	if (!response || response.status === 404) throw new BizError('Attachment not found', 404);
	response.headers.set('Cache-Control', 'private, no-store');
	response.headers.set('X-Request-ID', c.get('requestId'));
	return response;
});

app.post('/v1/messages', async c => {
	apiControlService.assertScope(c, 'mail.send', 'email:send');
	const body = await parseJsonBody(c);
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BizError('Invalid request body', 400);
	const receiveEmail = normalizeRecipients(body.to);
	if (typeof body.subject !== 'string' || body.subject.length > 998) throw new BizError('Invalid message subject', 400);
	if (body.text !== undefined && typeof body.text !== 'string') throw new BizError('Invalid text body', 400);
	if (body.html !== undefined && typeof body.html !== 'string') throw new BizError('Invalid HTML body', 400);
	const text = typeof body.text === 'string' ? body.text : '';
	if (encoder.encode(text).byteLength > MAX_MESSAGE_BODY_BYTES) throw new BizError('Text body is too large', 413);
	if (typeof body.html === 'string' && encoder.encode(body.html).byteLength > MAX_MESSAGE_BODY_BYTES) {
		throw new BizError('HTML body is too large', 413);
	}
	const html = typeof body.html === 'string' && body.html ? body.html : `<p>${textToHtml(text)}</p>`;
	const from = body.from;
	if (!from || typeof from !== 'object' || Array.isArray(from)) throw new BizError('Invalid sender', 400);
	const mailboxId = parsePositiveInteger(from.mailboxId, 'sender mailbox id');
	const hasDynamicFields = from.localPart !== undefined || from.domain !== undefined;
	if ((mailboxId && hasDynamicFields) || (!mailboxId && !hasDynamicFields)) {
		throw new BizError('Sender must use either mailboxId or localPart and domain', 400);
	}
	const allowedSenderFields = new Set(mailboxId ? ['mailboxId', 'name'] : ['localPart', 'domain', 'name']);
	if (Object.keys(from).some(key => !allowedSenderFields.has(key))) throw new BizError('Sender contains unsupported fields', 400);
	if (from.name !== undefined && (
		typeof from.name !== 'string' || from.name.length > 100 || /[\u0000-\u001f\u007f]/.test(from.name)
	)) throw new BizError('Invalid sender name', 400);
	const sendParams = {
		receiveEmail,
		subject: body.subject,
		text,
		content: html,
		attachments: normalizeApiAttachments(body.attachments),
		sendType: ''
	};
	if (mailboxId) {
		const mailbox = await accountService.selectById(c, mailboxId);
		if (!mailbox || mailbox.userId !== userContext.getUserId(c)) throw new BizError('Mailbox not found', 404);
		sendParams.accountId = mailboxId;
		sendParams.name = typeof from.name === 'string' ? from.name.trim() : '';
	} else {
		sendParams.from = from;
	}
	const sent = await emailService.send(c, {
		...sendParams
	}, userContext.getUserId(c));
	return apiResponse(c, mapMessage(sent[0]), 201);
});

app.all('/v1/*', async () => {
	throw new BizError('API endpoint not found', 404);
});
