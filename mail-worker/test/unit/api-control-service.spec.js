import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dbInit } from '../../src/init/init';
import apiControlService, { hashSecret } from '../../src/service/api-control-service';
import settingService from '../../src/service/setting-service';
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
	vi.spyOn(settingService, 'refresh').mockResolvedValue();
	await dbInit.init(context(env), {
		adminUsername: 'admin',
		adminPassword: `${crypto.randomUUID()}${crypto.randomUUID()}`,
		adminMailbox: 'admin@hpc.email'
	});
	return { database, env };
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
});
