import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dbInit } from '../../src/init/init';
import apiControlService, { hashSecret } from '../../src/service/api-control-service';
import permService from '../../src/service/perm-service';
import { FakeKV } from './test-utils';
import app from '../../src/hono/webs';

class D1StatementAdapter {
	constructor(database, sql, values = []) {
		this.database = database;
		this.sql = sql;
		this.values = values;
	}

	bind(...values) {
		return new D1StatementAdapter(this.database, this.sql, values);
	}

	async first() {
		return this.database.prepare(this.sql).get(...this.values) || null;
	}

	async all() {
		return { results: this.database.prepare(this.sql).all(...this.values) };
	}

	async raw() {
		return this.database.prepare(this.sql).all(...this.values).map(row => Object.values(row));
	}

	async run() {
		return this.database.prepare(this.sql).run(...this.values);
	}
}

function d1Adapter(database) {
	return {
		prepare(sql) {
			return new D1StatementAdapter(database, sql);
		},
		async batch(statements) {
			const results = [];
			for (const statement of statements) results.push(await statement.run());
			return results;
		}
	};
}

function context(env, headers = {}) {
	const values = new Map();
	const responseHeaders = new Map();
	const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
	return {
		env,
		req: {
			method: 'GET',
			path: '/v1/status',
			header: name => normalized[String(name).toLowerCase()] || ''
		},
		set: (key, value) => values.set(key, value),
		get: key => values.get(key),
		header: (key, value) => responseHeaders.set(key, value),
		responseHeaders
	};
}

async function initializedEnvironment() {
	const database = new DatabaseSync(':memory:');
	const env = { db: d1Adapter(database), kv: new FakeKV(), domain: ['hpc.email'] };
	await dbInit.init(context(env), {
		adminUsername: 'admin',
		adminPassword: `${crypto.randomUUID()}${crypto.randomUUID()}`,
	});
	return { database, env };
}

async function apiFixture() {
	const { database, env } = await initializedEnvironment();
	env.r2 = {
		get: async key => key === 'attachments/api-safe.txt'
			? { body: new TextEncoder().encode('safe attachment'), httpMetadata: { contentType: 'text/plain', contentDisposition: 'attachment; filename="api-safe.txt"' } }
			: null,
		put: vi.fn(),
		delete: vi.fn()
	};
	database.exec(`
		INSERT INTO user (username, display_name, type, password_hash)
		VALUES ('other-user', 'Other User', 2, 'not-used');
		INSERT INTO account (email, name, user_id, sort) VALUES
			('alpha@hpc.email', 'Alpha', 1, 20),
			('beta@hpc.email', 'Beta', 1, 10),
			('other@hpc.email', 'Other', 2, 10);
		INSERT INTO email (send_email, name, account_id, user_id, subject, text, content, type, status, to_email)
		VALUES
			('sender@example.com', 'Sender', 1, 1, 'Alpha message', 'alpha', '<p>alpha</p>', 0, 2, 'alpha@hpc.email'),
			('sender@example.com', 'Sender', 2, 1, 'Beta message', 'beta', '<p>beta</p>', 0, 2, 'beta@hpc.email'),
			('sender@example.com', 'Sender', 3, 2, 'Other message', 'other', '<p>other</p>', 0, 2, 'other@hpc.email');
		INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, type)
		VALUES
			(1, 1, 1, 'attachments/api-safe.txt', 'api-safe.txt', 'text/plain', 15, 0),
			(2, 3, 3, 'attachments/foreign.txt', 'foreign.txt', 'text/plain', 7, 0);
	`);
	const created = await apiControlService.create(context(env), {
		name: 'Integration client',
		userId: 1,
		scopes: ['mail.read', 'mail.send', 'mailbox.read'],
		allowedIps: [],
		rateLimit: 100
	}, 1);
	vi.spyOn(permService, 'userPermKeys').mockResolvedValue(['*']);
	return { database, env, secret: created.secret };
}

function apiRequest(env, secret, path, init = {}) {
	return app.request(`https://mail.example.com/v1${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${secret}`,
			'CF-Connecting-IP': '203.0.113.9',
			...(init.headers || {})
		}
	}, env);
}

describe('API key control', () => {
	afterEach(() => vi.restoreAllMocks());

	it('stores only a digest and reveals the API secret once', async () => {
		const { database, env } = await initializedEnvironment();
		const c = context(env);
		const created = await apiControlService.create(c, {
			name: 'Automation',
			userId: 1,
			scopes: ['mail.read', 'mailbox.read'],
			allowedIps: ['203.0.113.9'],
			rateLimit: 60
		}, 1);

		expect(created.secret).toMatch(/^hpc_live_[a-f0-9]{64}$/);
		const stored = database.prepare(`SELECT key_hash, key_prefix, key_suffix FROM api_key`).get();
		expect(stored.key_hash).toBe(await hashSecret(created.secret));
		expect(JSON.stringify(stored)).not.toContain(created.secret);

		const listed = await apiControlService.list(c);
		expect(listed.list[0]).not.toHaveProperty('secret');
		expect(listed.list[0]).not.toHaveProperty('keyHash');
		expect(listed.list[0].allowedIps).toEqual(['203.0.113.9']);
	});

	it('rejects control characters in API key names', async () => {
		const { env } = await initializedEnvironment();
		await expect(apiControlService.create(context(env), {
			name: 'Automation\nInjected',
			userId: 1,
			scopes: ['mail.read'],
			rateLimit: 60
		}, 1)).rejects.toMatchObject({ code: 400 });
	});

	it('enforces IP allowlists, scopes, and per-minute rate limits', async () => {
		const { env } = await initializedEnvironment();
		const admin = context(env);
		const created = await apiControlService.create(admin, {
			name: 'Limited client',
			userId: 1,
			scopes: ['mail.read'],
			allowedIps: ['203.0.113.9'],
			rateLimit: 1
		}, 1);
		vi.spyOn(permService, 'userPermKeys').mockResolvedValue(['*']);

		const wrongIp = context(env, { Authorization: `Bearer ${created.secret}`, 'CF-Connecting-IP': '203.0.113.10' });
		await expect(apiControlService.authenticate(wrongIp)).rejects.toMatchObject({ code: 403 });

		const allowed = context(env, { Authorization: `Bearer ${created.secret}`, 'CF-Connecting-IP': '203.0.113.9' });
		await expect(apiControlService.authenticate(allowed)).resolves.toMatchObject({ apiKeyId: created.apiKeyId });
		expect(() => apiControlService.assertScope(allowed, 'mail.read')).not.toThrow();
		expect(() => apiControlService.assertScope(allowed, 'mail.send')).toThrowError(/mail.send/);

		const limited = context(env, { Authorization: `Bearer ${created.secret}`, 'CF-Connecting-IP': '203.0.113.9' });
		await expect(apiControlService.authenticate(limited)).rejects.toMatchObject({ code: 429 });
	});

	it('serves the versioned API with REST status codes and request ids', async () => {
		const { env } = await initializedEnvironment();
		const created = await apiControlService.create(context(env), {
			name: 'Status client',
			userId: 1,
			scopes: ['mail.read'],
			allowedIps: [],
			rateLimit: 10
		}, 1);
		vi.spyOn(permService, 'userPermKeys').mockResolvedValue(['*']);

		const response = await app.request('https://mail.example.com/v1/status', {
			headers: { Authorization: `Bearer ${created.secret}`, 'CF-Connecting-IP': '203.0.113.9' }
		}, env);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ data: { status: 'ok', apiVersion: 'v1' } });
		expect(response.headers.get('X-Request-ID')).toBeTruthy();

		const sanitized = await app.request('https://mail.example.com/v1/status', {
			headers: {
				Authorization: `Bearer ${created.secret}`,
				'CF-Connecting-IP': '203.0.113.9',
				'X-Request-ID': 'contains spaces'
			}
		}, env);
		expect(sanitized.status).toBe(200);
		expect(sanitized.headers.get('X-Request-ID')).not.toBe('contains spaces');

		const unauthorized = await app.request('https://mail.example.com/v1/status', {
			headers: { Authorization: 'Bearer invalid' }
		}, env);
		expect(unauthorized.status).toBe(401);
		expect(await unauthorized.json()).toMatchObject({ error: { code: 401 } });
	});

	it('keeps mailbox and message reads inside the API key user boundary', async () => {
		const { env, secret } = await apiFixture();

		const mailboxResponse = await apiRequest(env, secret, '/mailboxes');
		expect(mailboxResponse.status).toBe(200);
		const mailboxes = (await mailboxResponse.json()).data.items;
		expect(mailboxes.map(item => item.address)).toEqual(['alpha@hpc.email', 'beta@hpc.email']);
		const domainsResponse = await apiRequest(env, secret, '/domains');
		expect(domainsResponse.status).toBe(200);
		expect((await domainsResponse.json()).data.items).toEqual(['hpc.email']);

		const allResponse = await apiRequest(env, secret, '/messages?direction=received');
		expect(allResponse.status).toBe(200);
		const allMessages = (await allResponse.json()).data.items;
		expect(allMessages.map(item => item.subject)).toEqual(['Beta message', 'Alpha message']);
		expect(allMessages[1].attachments[0].downloadUrl).toBe('/api/v1/messages/1/attachments/1');
		expect(allMessages[1].attachments[0]).not.toHaveProperty('path');

		const filteredResponse = await apiRequest(env, secret, '/messages?direction=received&mailboxId=1');
		expect(filteredResponse.status).toBe(200);
		expect((await filteredResponse.json()).data.items.map(item => item.subject)).toEqual(['Alpha message']);

		expect((await apiRequest(env, secret, '/messages?mailboxId=abc')).status).toBe(400);
		expect((await apiRequest(env, secret, '/messages?mailboxId=3')).status).toBe(404);
		expect((await apiRequest(env, secret, '/messages?direction=unknown')).status).toBe(400);
		expect((await apiRequest(env, secret, '/messages/3')).status).toBe(404);

		const attachmentResponse = await apiRequest(env, secret, '/messages/1/attachments/1');
		expect(attachmentResponse.status).toBe(200);
		expect(await attachmentResponse.text()).toBe('safe attachment');
		expect(attachmentResponse.headers.get('Cache-Control')).toContain('no-store');
		expect((await apiRequest(env, secret, '/messages/3/attachments/2')).status).toBe(404);
	});

	it('sends from either an owned mailbox or an authorized dynamic address', async () => {
		const { env, secret } = await apiFixture();
		const send = body => apiRequest(env, secret, '/messages', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const common = { to: ['destination@hpc.email'], subject: 'API send', text: 'Hello' };

		const registered = await send({ ...common, from: { mailboxId: 1, name: 'Registered' } });
		expect(registered.status).toBe(201);
		expect((await registered.json()).data.from).toEqual({ address: 'alpha@hpc.email', name: 'Registered' });

		const dynamic = await send({ ...common, from: { localPart: 'notice', domain: 'hpc.email', name: 'Dynamic' } });
		expect(dynamic.status).toBe(201);
		expect((await dynamic.json()).data.from).toEqual({ address: 'notice@hpc.email', name: 'Dynamic' });

		expect((await send({ ...common, from: { mailboxId: 3 } })).status).toBe(404);
		expect((await send({ ...common, from: { mailboxId: 1, localPart: 'invalid', domain: 'hpc.email' } })).status).toBe(400);
		expect((await send({ ...common, from: { localPart: 'notice', domain: 'not-configured.example' } })).status).toBe(403);
		expect((await send({ ...common, to: Array.from({ length: 51 }, (_, index) => `user${index}@hpc.email`), from: { mailboxId: 1 } })).status).toBe(400);
	});

	it('requires the bound user role permission in addition to mailbox scope', async () => {
		const { env, secret } = await apiFixture();
		permService.userPermKeys.mockResolvedValue(['email:send']);
		const response = await apiRequest(env, secret, '/mailboxes');
		expect(response.status).toBe(403);
	});
});
