import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dbInit, SCHEMA_VERSION } from '../../src/init/init';
import settingService from '../../src/service/setting-service';
import { FakeKV } from './test-utils';
import { settingConst } from '../../src/const/entity-const';

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

function initContext(database, kv = new FakeKV()) {
	return {
		env: { db: d1Adapter(database), kv, domain: ['hpc.email'] },
		set: vi.fn()
	};
}

function initPayload(overrides = {}) {
	return {
		adminUsername: 'riba2534',
		adminPassword: `${crypto.randomUUID()}${crypto.randomUUID()}`,
		...overrides
	};
}

describe('versioned clean database initialization', () => {
	afterEach(() => vi.restoreAllMocks());

	it('creates only the current schema and is idempotent at the same version', async () => {
		const database = new DatabaseSync(':memory:');
		const kv = new FakeKV({
			'auth-uid:1': '{"stale":true}',
			'login-fail:id:stale': '{"count":10}',
			'send_day_count:2026-07-14': '8'
		});
		const c = initContext(database, kv);
		vi.spyOn(settingService, 'refresh').mockResolvedValue();

		const first = await dbInit.init(c, initPayload());
		expect(first).toMatchObject({ schemaVersion: SCHEMA_VERSION, rebuilt: true });
		expect(kv.values.has('auth-uid:1')).toBe(false);
		expect(kv.values.has('login-fail:id:stale')).toBe(false);
		expect(kv.values.has('send_day_count:2026-07-14')).toBe(false);

		const columns = database.prepare(`PRAGMA table_info('user')`).all().map(row => row.name);
		expect(columns).toContain('username');
		expect(columns).toContain('password_hash');
		expect(columns).not.toContain('email');
		expect(columns).not.toContain('salt');

		const admin = database.prepare(`SELECT username, type FROM user`).get();
		expect(admin).toEqual({ username: 'riba2534', type: 1 });
		expect(database.prepare(`SELECT COUNT(*) AS total FROM account`).get()).toEqual({ total: 0 });
		expect(database.prepare(`SELECT key, is_system FROM role WHERE role_id = 1`).get()).toEqual({ key: 'admin', is_system: 1 });
		expect(database.prepare(`SELECT key, is_system FROM role WHERE role_id = 2`).get()).toEqual({ key: 'user', is_system: 1 });
		expect(database.prepare(`PRAGMA table_info('verify_record')`).all().find(row => row.name === 'ip').type).toBe('TEXT');
		expect(database.prepare(`SELECT no_recipient FROM setting`).get().no_recipient).toBe(settingConst.noRecipient.OPEN);
		expect(database.prepare(`SELECT enabled FROM api_config WHERE config_id = 1`).get()).toEqual({ enabled: 1 });
		expect(database.prepare(`SELECT perm_key FROM perm WHERE perm_id = 38`).get()).toEqual({ perm_key: 'api-key:query' });
		expect(database.prepare(`PRAGMA table_info('api_key')`).all().map(row => row.name)).toContain('key_hash');
		expect(database.prepare(`PRAGMA table_info('setting')`).all().map(row => row.name)).toEqual(expect.arrayContaining([
			'feishu_bot_status', 'feishu_webhook_url', 'feishu_bot_secret'
		]));

		const second = await dbInit.init(c, {});
		expect(second).toEqual({ schemaVersion: SCHEMA_VERSION, rebuilt: false });
		expect(database.prepare(`SELECT COUNT(*) AS total FROM user`).get().total).toBe(1);
	});

	it('upgrades the active version 4 schema without deleting users', async () => {
		const database = new DatabaseSync(':memory:');
		const c = initContext(database);
		vi.spyOn(settingService, 'refresh').mockResolvedValue();
		await dbInit.init(c, initPayload());
		database.exec(`
			DROP TABLE api_rate_limit;
			DROP TABLE api_call_log;
			DROP TABLE api_key;
			DROP TABLE api_config;
			DELETE FROM perm WHERE perm_id >= 37;
			ALTER TABLE setting DROP COLUMN feishu_bot_status;
			ALTER TABLE setting DROP COLUMN feishu_webhook_url;
			ALTER TABLE setting DROP COLUMN feishu_bot_secret;
			UPDATE schema_meta SET schema_version = '4';
		`);

		const migrated = await dbInit.init(c, {});
		expect(migrated).toEqual({ schemaVersion: SCHEMA_VERSION, rebuilt: false, migratedFrom: '4' });
		expect(database.prepare(`SELECT username FROM user WHERE user_id = 1`).get()).toEqual({ username: 'riba2534' });
		expect(database.prepare(`SELECT enabled FROM api_config`).get()).toEqual({ enabled: 1 });
		expect(database.prepare(`SELECT schema_version FROM schema_meta`).get()).toEqual({ schema_version: SCHEMA_VERSION });
		expect(database.prepare(`SELECT feishu_bot_status, feishu_webhook_url, feishu_bot_secret FROM setting`).get()).toEqual({
			feishu_bot_status: 1,
			feishu_webhook_url: '',
			feishu_bot_secret: ''
		});
	});

	it('upgrades version 5 in place and preserves users, mailboxes, and API keys', async () => {
		const database = new DatabaseSync(':memory:');
		const c = initContext(database);
		vi.spyOn(settingService, 'refresh').mockResolvedValue();
		await dbInit.init(c, initPayload());
		database.exec(`
			INSERT INTO account (email, name, user_id) VALUES ('kept@hpc.email', 'kept', 1);
			INSERT INTO api_key (name, key_prefix, key_suffix, key_hash, user_id, scopes, created_by)
			VALUES ('kept', 'hpc_live_123456', 'abcdef', 'hash', 1, '["mail.read"]', 1);
			ALTER TABLE setting DROP COLUMN feishu_bot_status;
			ALTER TABLE setting DROP COLUMN feishu_webhook_url;
			ALTER TABLE setting DROP COLUMN feishu_bot_secret;
			UPDATE schema_meta SET schema_version = '5';
		`);

		const migrated = await dbInit.init(c, {});
		expect(migrated).toEqual({ schemaVersion: SCHEMA_VERSION, rebuilt: false, migratedFrom: '5' });
		expect(database.prepare(`SELECT username FROM user WHERE user_id = 1`).get()).toEqual({ username: 'riba2534' });
		expect(database.prepare(`SELECT email FROM account WHERE account_id = 1`).get()).toEqual({ email: 'kept@hpc.email' });
		expect(database.prepare(`SELECT name FROM api_key WHERE api_key_id = 1`).get()).toEqual({ name: 'kept' });
		expect(database.prepare(`SELECT feishu_bot_status FROM setting`).get()).toEqual({ feishu_bot_status: 1 });
	});

	it('requires explicit rebuild permission for a legacy database', async () => {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			CREATE TABLE user (user_id INTEGER PRIMARY KEY, email TEXT NOT NULL);
			CREATE TABLE _cf_KV (key TEXT PRIMARY KEY, value BLOB)
		`);
		const c = initContext(database);
		vi.spyOn(settingService, 'refresh').mockResolvedValue();

		await expect(dbInit.init(c, initPayload())).rejects.toMatchObject({ code: 409 });
		const rebuilt = await dbInit.init(c, initPayload({ rebuild: true }));
		expect(rebuilt).toMatchObject({ schemaVersion: SCHEMA_VERSION, rebuilt: true });
		expect(database.prepare(`SELECT name FROM sqlite_master WHERE name = '_cf_KV'`).get()).toEqual({ name: '_cf_KV' });
	});
});
