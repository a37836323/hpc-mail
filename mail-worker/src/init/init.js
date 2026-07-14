import BizError from '../error/biz-error';
import KvConst from '../const/kv-const';
import settingService from '../service/setting-service';
import cryptoUtils from '../utils/crypto-utils';
import { isValidUsername, normalizeUsername } from '../utils/auth-utils';

const SCHEMA_VERSION = '6';

const FEISHU_SETTING_MIGRATION_SQL = [
	`ALTER TABLE setting ADD COLUMN feishu_bot_status INTEGER NOT NULL DEFAULT 1`,
	`ALTER TABLE setting ADD COLUMN feishu_webhook_url TEXT NOT NULL DEFAULT ''`,
	`ALTER TABLE setting ADD COLUMN feishu_bot_secret TEXT NOT NULL DEFAULT ''`
];

const API_SCHEMA_SQL = [
	`CREATE TABLE api_config (
		config_id INTEGER PRIMARY KEY NOT NULL DEFAULT 1,
		enabled INTEGER NOT NULL DEFAULT 1,
		updated_by INTEGER,
		updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		CHECK (config_id = 1)
	)`,
	`CREATE TABLE api_key (
		api_key_id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		key_prefix TEXT NOT NULL,
		key_suffix TEXT NOT NULL,
		key_hash TEXT NOT NULL,
		user_id INTEGER NOT NULL,
		scopes TEXT NOT NULL DEFAULT '[]',
		allowed_ips TEXT NOT NULL DEFAULT '[]',
		rate_limit INTEGER NOT NULL DEFAULT 60,
		status INTEGER NOT NULL DEFAULT 1,
		expires_at DATETIME,
		last_used_at DATETIME,
		last_used_ip TEXT,
		created_by INTEGER NOT NULL,
		create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE UNIQUE INDEX idx_api_key_hash ON api_key (key_hash)`,
	`CREATE INDEX idx_api_key_user_status ON api_key (user_id, status)`,
	`CREATE TABLE api_call_log (
		log_id INTEGER PRIMARY KEY AUTOINCREMENT,
		api_key_id INTEGER NOT NULL,
		request_id TEXT NOT NULL,
		method TEXT NOT NULL,
		path TEXT NOT NULL,
		status_code INTEGER NOT NULL,
		ip TEXT NOT NULL DEFAULT '',
		duration_ms INTEGER NOT NULL DEFAULT 0,
		create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE INDEX idx_api_call_log_key_time ON api_call_log (api_key_id, create_time DESC)`,
	`CREATE INDEX idx_api_call_log_time ON api_call_log (create_time DESC)`,
	`CREATE TABLE api_rate_limit (
		api_key_id INTEGER NOT NULL,
		window_start INTEGER NOT NULL,
		request_count INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (api_key_id, window_start)
	)`
];

const DROP_TABLES = [
	'api_rate_limit',
	'api_call_log',
	'api_key',
	'api_config',
	'role_perm',
	'star',
	'attachments',
	'email',
	'account',
	'reg_key',
	'verify_record',
	'user',
	'perm',
	'role',
	'setting',
	'schema_meta'
];

const SCHEMA_SQL = [
	`CREATE TABLE schema_meta (
		schema_version TEXT PRIMARY KEY NOT NULL,
		instance_epoch TEXT NOT NULL,
		created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE perm (
		perm_id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		perm_key TEXT,
		pid INTEGER NOT NULL DEFAULT 0,
		type INTEGER NOT NULL DEFAULT 2,
		sort INTEGER
	)`,
	`CREATE TABLE role (
		role_id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		key TEXT NOT NULL COLLATE NOCASE,
		description TEXT,
		ban_email TEXT NOT NULL DEFAULT '',
		ban_email_type INTEGER NOT NULL DEFAULT 0,
		avail_domain TEXT NOT NULL DEFAULT '',
		sort INTEGER NOT NULL DEFAULT 0,
		is_default INTEGER NOT NULL DEFAULT 0,
		is_system INTEGER NOT NULL DEFAULT 0,
		create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		user_id INTEGER,
		send_count INTEGER,
		send_type TEXT NOT NULL DEFAULT 'count',
		account_count INTEGER
	)`,
	`CREATE UNIQUE INDEX idx_role_key_nocase ON role (key COLLATE NOCASE)`,
	`CREATE TABLE role_perm (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		role_id INTEGER NOT NULL,
		perm_id INTEGER NOT NULL
	)`,
	`CREATE UNIQUE INDEX idx_role_perm_unique ON role_perm (role_id, perm_id)`,
	`CREATE TABLE user (
		user_id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL COLLATE NOCASE,
		display_name TEXT NOT NULL DEFAULT '',
		type INTEGER NOT NULL,
		password_hash TEXT NOT NULL,
		status INTEGER NOT NULL DEFAULT 0,
		create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		active_time DATETIME,
		create_ip TEXT,
		active_ip TEXT,
		os TEXT,
		browser TEXT,
		device TEXT,
		sort INTEGER NOT NULL DEFAULT 0,
		send_count INTEGER NOT NULL DEFAULT 0,
		reg_key_id INTEGER NOT NULL DEFAULT 0,
		is_del INTEGER NOT NULL DEFAULT 0
	)`,
	`CREATE UNIQUE INDEX idx_user_username_nocase ON user (username COLLATE NOCASE)`,
	`CREATE TABLE account (
		account_id INTEGER PRIMARY KEY AUTOINCREMENT,
		email TEXT NOT NULL COLLATE NOCASE,
		name TEXT NOT NULL DEFAULT '',
		status INTEGER NOT NULL DEFAULT 0,
		latest_email_time DATETIME,
		create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		user_id INTEGER NOT NULL,
		sort INTEGER NOT NULL DEFAULT 0,
		is_del INTEGER NOT NULL DEFAULT 0
	)`,
	`CREATE UNIQUE INDEX idx_account_email_nocase ON account (email COLLATE NOCASE)`,
	`CREATE INDEX idx_account_user_id ON account (user_id, is_del)`,
	`CREATE TABLE email (
		email_id INTEGER PRIMARY KEY AUTOINCREMENT,
		send_email TEXT,
		name TEXT,
		account_id INTEGER NOT NULL DEFAULT 0,
		user_id INTEGER NOT NULL DEFAULT 0,
		subject TEXT,
		code TEXT NOT NULL DEFAULT '',
		text TEXT,
		content TEXT,
		cc TEXT NOT NULL DEFAULT '[]',
		bcc TEXT NOT NULL DEFAULT '[]',
		recipient TEXT NOT NULL DEFAULT '[]',
		to_email TEXT NOT NULL DEFAULT '',
		to_name TEXT NOT NULL DEFAULT '',
		in_reply_to TEXT NOT NULL DEFAULT '',
		relation TEXT NOT NULL DEFAULT '',
		message_id TEXT NOT NULL DEFAULT '',
		type INTEGER NOT NULL DEFAULT 0,
		status INTEGER NOT NULL DEFAULT 0,
		resend_email_id TEXT,
		message TEXT,
		unread INTEGER NOT NULL DEFAULT 0,
		create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		is_del INTEGER NOT NULL DEFAULT 0
	)`,
	`CREATE INDEX idx_email_user_account ON email (user_id, account_id, type, is_del)`,
	`CREATE INDEX idx_email_status ON email (status, email_id)`,
	`CREATE TABLE attachments (
		att_id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		email_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL,
		key TEXT NOT NULL,
		filename TEXT,
		mime_type TEXT,
		size INTEGER,
		status INTEGER NOT NULL DEFAULT 0,
		type INTEGER NOT NULL DEFAULT 0,
		disposition TEXT,
		related TEXT,
		content_id TEXT,
		encoding TEXT,
		create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE INDEX idx_attachments_email_id ON attachments (email_id)`,
	`CREATE TABLE star (
		star_id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		email_id INTEGER NOT NULL,
		create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE UNIQUE INDEX idx_star_user_email ON star (user_id, email_id)`,
	`CREATE TABLE reg_key (
		reg_key_id INTEGER PRIMARY KEY AUTOINCREMENT,
		code TEXT NOT NULL COLLATE NOCASE DEFAULT '',
		count INTEGER NOT NULL DEFAULT 0,
		role_id INTEGER NOT NULL DEFAULT 0,
		user_id INTEGER NOT NULL DEFAULT 0,
		expire_time DATETIME,
		create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE UNIQUE INDEX idx_reg_key_code_nocase ON reg_key (code COLLATE NOCASE)`,
	`CREATE TABLE verify_record (
		vr_id INTEGER PRIMARY KEY AUTOINCREMENT,
		ip TEXT NOT NULL DEFAULT '',
		count INTEGER NOT NULL DEFAULT 1,
		type INTEGER NOT NULL DEFAULT 0,
		update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	...API_SCHEMA_SQL,
	`CREATE TABLE setting (
		register INTEGER NOT NULL DEFAULT 0,
		receive INTEGER NOT NULL DEFAULT 0,
		add_email INTEGER NOT NULL DEFAULT 0,
		many_email INTEGER NOT NULL DEFAULT 0,
		title TEXT NOT NULL DEFAULT 'HPC Mail',
		auto_refresh INTEGER NOT NULL DEFAULT 5,
		register_verify INTEGER NOT NULL DEFAULT 1,
		add_email_verify INTEGER NOT NULL DEFAULT 1,
		reg_verify_count INTEGER NOT NULL DEFAULT 1,
		add_verify_count INTEGER NOT NULL DEFAULT 1,
		send INTEGER NOT NULL DEFAULT 0,
		r2_domain TEXT,
		secret_key TEXT,
		site_key TEXT,
		reg_key INTEGER NOT NULL DEFAULT 1,
		background TEXT,
		tg_bot_token TEXT NOT NULL DEFAULT '',
		tg_chat_id TEXT NOT NULL DEFAULT '',
		tg_bot_status INTEGER NOT NULL DEFAULT 1,
		feishu_bot_status INTEGER NOT NULL DEFAULT 1,
		feishu_webhook_url TEXT NOT NULL DEFAULT '',
		feishu_bot_secret TEXT NOT NULL DEFAULT '',
		forward_email TEXT NOT NULL DEFAULT '',
		forward_status INTEGER NOT NULL DEFAULT 1,
		rule_email TEXT NOT NULL DEFAULT '',
		rule_type INTEGER NOT NULL DEFAULT 0,
		login_opacity REAL NOT NULL DEFAULT 0.88,
		resend_tokens TEXT NOT NULL DEFAULT '{}',
		notice_title TEXT NOT NULL DEFAULT 'HPC Mail',
		notice_content TEXT NOT NULL DEFAULT '',
		notice_type TEXT NOT NULL DEFAULT 'none',
		notice_duration INTEGER NOT NULL DEFAULT 0,
		notice_position TEXT NOT NULL DEFAULT 'top-right',
		notice_offset INTEGER NOT NULL DEFAULT 0,
		notice_width INTEGER NOT NULL DEFAULT 400,
		notice INTEGER NOT NULL DEFAULT 0,
		no_recipient INTEGER NOT NULL DEFAULT 0,
		login_domain INTEGER NOT NULL DEFAULT 0,
		bucket TEXT NOT NULL DEFAULT '',
		region TEXT NOT NULL DEFAULT '',
		endpoint TEXT NOT NULL DEFAULT '',
		s3_access_key TEXT NOT NULL DEFAULT '',
		s3_secret_key TEXT NOT NULL DEFAULT '',
		force_path_style INTEGER NOT NULL DEFAULT 1,
		custom_domain TEXT NOT NULL DEFAULT '',
		tg_msg_from TEXT NOT NULL DEFAULT 'only-name',
		tg_msg_to TEXT NOT NULL DEFAULT 'show',
		tg_msg_text TEXT NOT NULL DEFAULT 'hide',
		min_email_prefix INTEGER NOT NULL DEFAULT 1,
		email_prefix_filter TEXT NOT NULL DEFAULT '',
		black_subject TEXT NOT NULL DEFAULT '',
		black_content TEXT NOT NULL DEFAULT '',
		black_from TEXT NOT NULL DEFAULT '',
		ai_code INTEGER NOT NULL DEFAULT 1,
		ai_code_filter TEXT NOT NULL DEFAULT ''
	)`
];

const PERMISSION_ROWS = [
	[1, '邮件', null, 0, 0, 0],
	[2, '邮件删除', 'email:delete', 1, 2, 1],
	[3, '邮件发送', 'email:send', 1, 2, 0],
	[4, '个人设置', '', 0, 1, 2],
	[5, '用户注销', 'my:delete', 4, 2, 0],
	[6, '用户信息', null, 0, 1, 3],
	[7, '用户查看', 'user:query', 6, 2, 0],
	[8, '密码修改', 'user:set-pwd', 6, 2, 2],
	[9, '状态修改', 'user:set-status', 6, 2, 3],
	[10, '权限修改', 'user:set-type', 6, 2, 4],
	[11, '用户删除', 'user:delete', 6, 2, 7],
	[13, '权限控制', '', 0, 1, 5],
	[14, '身份查看', 'role:query', 13, 2, 0],
	[15, '身份修改', 'role:set', 13, 2, 1],
	[16, '身份删除', 'role:delete', 13, 2, 2],
	[17, '系统设置', '', 0, 1, 6],
	[18, '设置查看', 'setting:query', 17, 2, 0],
	[19, '设置修改', 'setting:set', 17, 2, 1],
	[21, '邮箱侧栏', '', 0, 0, 1],
	[22, '邮箱查看', 'account:query', 21, 2, 0],
	[23, '邮箱添加', 'account:add', 21, 2, 1],
	[24, '邮箱删除', 'account:delete', 21, 2, 2],
	[25, '用户添加', 'user:add', 6, 2, 1],
	[26, '发件重置', 'user:reset-send', 6, 2, 6],
	[27, '邮件列表', '', 0, 1, 4],
	[28, '邮件查看', 'all-email:query', 27, 2, 0],
	[29, '邮件删除', 'all-email:delete', 27, 2, 1],
	[30, '身份添加', 'role:add', 13, 2, -1],
	[31, '分析页', null, 0, 1, 2.1],
	[32, '数据查看', 'analysis:query', 31, 2, 1],
	[33, '注册密钥', null, 0, 1, 5.1],
	[34, '密钥查看', 'reg-key:query', 33, 2, 0],
	[35, '密钥添加', 'reg-key:add', 33, 2, 1],
	[36, '密钥删除', 'reg-key:delete', 33, 2, 2],
	[37, 'API 控制', null, 0, 1, 5.2],
	[38, 'API 查看', 'api-key:query', 37, 2, 0],
	[39, 'API 创建', 'api-key:add', 37, 2, 1],
	[40, 'API 修改', 'api-key:set', 37, 2, 2],
	[41, 'API 删除', 'api-key:delete', 37, 2, 3]
];

const API_PERMISSION_ROWS = PERMISSION_ROWS.filter(row => row[0] >= 37);

const DEFAULT_ROLE_PERMISSIONS = [2, 3, 5, 22, 23, 24];

function normalizeInitParams(params = {}) {
	const adminUsername = normalizeUsername(params.adminUsername);
	const adminPassword = params.adminPassword;

	if (!isValidUsername(adminUsername)) throw new BizError('Invalid admin username', 400);
	if (typeof adminPassword !== 'string' || adminPassword.length < 12 || adminPassword.length > 128) {
		throw new BizError('Admin password must contain 12 to 128 characters', 400);
	}

	return { adminUsername, adminPassword };
}

async function schemaVersion(c) {
	const table = await c.env.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'`).first();
	if (!table) return null;
	const row = await c.env.db.prepare(`SELECT schema_version FROM schema_meta LIMIT 1`).first();
	return row?.schema_version || null;
}

async function hasApplicationTables(c) {
	const row = await c.env.db.prepare(`
		SELECT name FROM sqlite_master
		WHERE type = 'table'
		  AND name NOT GLOB 'sqlite_*'
		  AND name NOT GLOB '_cf_*'
		LIMIT 1
	`).first();
	return Boolean(row);
}

async function clearRuntimeState(c) {
	const kv = c.env.kv;
	if (!kv) return;
	if (typeof kv.list === 'function') {
		for (const prefix of [KvConst.AUTH_INFO, KvConst.LOGIN_FAILURE, KvConst.SEND_DAY_COUNT]) {
			let cursor;
			do {
				const page = await kv.list({ prefix, ...(cursor ? { cursor } : {}) });
				await Promise.all((page.keys || []).map(item => kv.delete(item.name)));
				cursor = page.list_complete ? null : page.cursor;
			} while (cursor);
		}
	}
	await Promise.all([
		kv.delete(KvConst.SETTING),
		kv.delete(KvConst.INSTANCE_EPOCH),
		kv.delete(KvConst.PUBLIC_KEY),
		kv.delete(KvConst.ANALYSIS_ECHARTS)
	]);
}

async function dropSchema(c) {
	const { results = [] } = await c.env.db.prepare(`
		SELECT name FROM sqlite_master
		WHERE type = 'table'
		  AND name NOT GLOB 'sqlite_*'
		  AND name NOT GLOB '_cf_*'
	`).all();
	const present = new Set(results.map(row => row.name));
	const ordered = [
		...DROP_TABLES.filter(table => present.has(table)),
		...results.map(row => row.name).filter(table => !DROP_TABLES.includes(table))
	];
	for (const table of ordered) {
		await c.env.db.prepare(`DROP TABLE IF EXISTS "${table.replaceAll('"', '""')}"`).run();
	}
}

async function createSchema(c, initParams) {
	await c.env.db.batch(SCHEMA_SQL.map(sql => c.env.db.prepare(sql)));

	for (const row of PERMISSION_ROWS) {
		await c.env.db.prepare(`INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES (?, ?, ?, ?, ?, ?)`)
			.bind(...row)
			.run();
	}

	await c.env.db.prepare(`
		INSERT INTO role (role_id, name, key, description, avail_domain, sort, is_default, is_system, send_count, send_type, account_count)
		VALUES (1, '管理员', 'admin', '系统管理员', '*', 0, 0, 1, NULL, 'count', NULL),
		       (2, '普通用户', 'user', '普通用户', '', 1, 1, 1, NULL, 'count', 10)
	`).run();

	for (let index = 0; index < DEFAULT_ROLE_PERMISSIONS.length; index += 1) {
		await c.env.db.prepare(`INSERT INTO role_perm (id, role_id, perm_id) VALUES (?, 2, ?)`)
			.bind(100 + index, DEFAULT_ROLE_PERMISSIONS[index])
			.run();
	}

	await c.env.db.prepare(`INSERT INTO setting DEFAULT VALUES`).run();
	await c.env.db.prepare(`INSERT INTO api_config (config_id, enabled) VALUES (1, 1)`).run();
	const instanceEpoch = crypto.randomUUID();
	await c.env.db.prepare(`INSERT INTO schema_meta (schema_version, instance_epoch) VALUES (?, ?)`)
		.bind(SCHEMA_VERSION, instanceEpoch)
		.run();
	if (c.env.kv) await c.env.kv.put(KvConst.INSTANCE_EPOCH, instanceEpoch);

	const { hash } = await cryptoUtils.hashPassword(initParams.adminPassword);
	await c.env.db.prepare(`
		INSERT INTO user (username, display_name, type, password_hash)
		VALUES (?, ?, 1, ?)
	`).bind(initParams.adminUsername, initParams.adminUsername, hash).run();

	return instanceEpoch;
}

async function migrateFromVersion4(c) {
	const statements = [
		...API_SCHEMA_SQL.map(sql => c.env.db.prepare(sql)),
		...FEISHU_SETTING_MIGRATION_SQL.map(sql => c.env.db.prepare(sql))
	];
	statements.push(c.env.db.prepare(`INSERT INTO api_config (config_id, enabled) VALUES (1, 1)`));
	for (const row of API_PERMISSION_ROWS) {
		statements.push(
			c.env.db.prepare(`INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES (?, ?, ?, ?, ?, ?)`)
				.bind(...row)
		);
	}
	statements.push(c.env.db.prepare(`UPDATE schema_meta SET schema_version = ?`).bind(SCHEMA_VERSION));
	await c.env.db.batch(statements);
}

async function migrateFromVersion5(c) {
	await c.env.db.batch([
		...FEISHU_SETTING_MIGRATION_SQL.map(sql => c.env.db.prepare(sql)),
		c.env.db.prepare(`UPDATE schema_meta SET schema_version = ?`).bind(SCHEMA_VERSION)
	]);
}

const dbInit = {
	async init(c, params = {}) {
		const currentVersion = await schemaVersion(c);
		const rebuildRequested = params.rebuild === true;

		if (currentVersion === SCHEMA_VERSION && !rebuildRequested) {
			await settingService.refresh(c);
			return { schemaVersion: SCHEMA_VERSION, rebuilt: false };
		}
		if (currentVersion === '4' && !rebuildRequested) {
			await migrateFromVersion4(c);
			await settingService.refresh(c);
			return { schemaVersion: SCHEMA_VERSION, rebuilt: false, migratedFrom: currentVersion };
		}
		if (currentVersion === '5' && !rebuildRequested) {
			await migrateFromVersion5(c);
			await settingService.refresh(c);
			return { schemaVersion: SCHEMA_VERSION, rebuilt: false, migratedFrom: currentVersion };
		}
		const hasTables = await hasApplicationTables(c);
		if (hasTables && !rebuildRequested) {
			throw new BizError(
				`Database schema mismatch (current: ${currentVersion || 'legacy'}, required: ${SCHEMA_VERSION}); set rebuild=true to recreate it`,
				409
			);
		}

		const initParams = normalizeInitParams(params);
		await clearRuntimeState(c);
		if (hasTables) await dropSchema(c);
		const instanceEpoch = await createSchema(c, initParams);
		await settingService.refresh(c);
		return { schemaVersion: SCHEMA_VERSION, instanceEpoch, rebuilt: true };
	}
};

export { dbInit, SCHEMA_VERSION };
