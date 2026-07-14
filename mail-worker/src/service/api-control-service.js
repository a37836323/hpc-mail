import BizError from '../error/biz-error';
import permService from './perm-service';

const API_KEY_PREFIX = 'hpc_live_';
const API_SCOPES = Object.freeze(['mail.read', 'mail.send', 'mailbox.read']);
const encoder = new TextEncoder();

function bytesToHex(bytes) {
	return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function generateSecret() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return `${API_KEY_PREFIX}${bytesToHex(bytes)}`;
}

async function hashSecret(secret) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
	return bytesToHex(new Uint8Array(digest));
}

function parseJsonArray(value) {
	if (Array.isArray(value)) return value;
	if (typeof value !== 'string' || !value) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch (_) {
		return [];
	}
}

function normalizeScopes(value) {
	if (!Array.isArray(value)) throw new BizError('API scopes must be an array', 400);
	const scopes = [...new Set(value.map(item => String(item).trim()).filter(Boolean))];
	if (!scopes.length || scopes.some(scope => !API_SCOPES.includes(scope))) {
		throw new BizError('Invalid API scope', 400);
	}
	return scopes;
}

function normalizeIpAddress(value) {
	if (typeof value !== 'string' || !value || value.length > 64) return null;
	const normalized = value.trim().toLowerCase();
	const ipv4 = normalized.split('.');
	if (ipv4.length === 4 && ipv4.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
		return ipv4.map(Number).join('.');
	}
	if (!normalized.includes(':') || !/^[0-9a-f:]+$/i.test(normalized)) return null;
	try {
		return new URL(`http://[${normalized}]/`).hostname.replace(/^\[|\]$/g, '');
	} catch (_) {
		return null;
	}
}

function normalizeAllowedIps(value) {
	const items = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(/[\s,]+/)
			: [];
	const normalized = items.map(item => normalizeIpAddress(String(item)));
	if (normalized.some(ip => ip === null)) {
		throw new BizError('IP whitelist contains an invalid address', 400);
	}
	const ips = [...new Set(normalized.filter(Boolean))];
	if (ips.length > 20) throw new BizError('IP whitelist supports at most 20 addresses', 400);
	return ips;
}

function normalizeExpiry(value) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
		throw new BizError('API key expiration must be in the future', 400);
	}
	return date.toISOString();
}

function clientIp(c) {
	const value = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'Unknown';
	const first = value.split(',')[0].trim().toLowerCase();
	return normalizeIpAddress(first) || first;
}

function mapKey(row) {
	if (!row) return null;
	return {
		apiKeyId: row.apiKeyId,
		name: row.name,
		keyHint: `${row.keyPrefix}…${row.keySuffix}`,
		userId: row.userId,
		username: row.username,
		displayName: row.displayName || '',
		scopes: parseJsonArray(row.scopes),
		allowedIps: parseJsonArray(row.allowedIps),
		rateLimit: row.rateLimit,
		status: row.status,
		expiresAt: row.expiresAt,
		lastUsedAt: row.lastUsedAt,
		lastUsedIp: row.lastUsedIp,
		createdBy: row.createdBy,
		creatorName: row.creatorName,
		createTime: row.createTime
	};
}

function changedRows(result) {
	return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

const apiControlService = {
	API_SCOPES,

	async config(c) {
		const config = await c.env.db.prepare(`
			SELECT enabled, updated_by AS updatedBy, updated_time AS updatedTime
			FROM api_config WHERE config_id = 1
		`).first();
		const [keyStats, callStats] = await Promise.all([
			c.env.db.prepare(`
				SELECT COUNT(*) AS total,
				       SUM(CASE WHEN k.status = 1 AND u.status = 0 AND u.is_del = 0
				                         AND (k.expires_at IS NULL OR datetime(k.expires_at) > CURRENT_TIMESTAMP)
				                    THEN 1 ELSE 0 END) AS active
				FROM api_key k LEFT JOIN user u ON u.user_id = k.user_id
			`).first(),
			c.env.db.prepare(`
				SELECT COUNT(*) AS calls24h,
				       SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors24h
				FROM api_call_log WHERE create_time >= datetime('now', '-24 hours')
			`).first()
		]);
		return {
			enabled: config?.enabled === 1,
			updatedBy: config?.updatedBy || null,
			updatedTime: config?.updatedTime || null,
			totalKeys: Number(keyStats?.total || 0),
			activeKeys: Number(keyStats?.active || 0),
			calls24h: Number(callStats?.calls24h || 0),
			errors24h: Number(callStats?.errors24h || 0)
		};
	},

	async setConfig(c, params, userId) {
		if (typeof params?.enabled !== 'boolean') throw new BizError('Invalid API status', 400);
		await c.env.db.prepare(`
			UPDATE api_config SET enabled = ?, updated_by = ?, updated_time = CURRENT_TIMESTAMP WHERE config_id = 1
		`).bind(params.enabled ? 1 : 0, userId).run();
		return this.config(c);
	},

	async userOptions(c) {
		const { results = [] } = await c.env.db.prepare(`
			SELECT user_id AS userId, username, display_name AS displayName
			FROM user WHERE status = 0 AND is_del = 0 ORDER BY username COLLATE NOCASE ASC LIMIT 200
		`).all();
		return results;
	},

	async create(c, params, createdBy) {
		const name = typeof params?.name === 'string' ? params.name.trim() : '';
		const userId = Number(params?.userId);
		const rateLimit = Number(params?.rateLimit || 60);
		if (!name || name.length > 50 || /[\u0000-\u001f\u007f]/.test(name)) {
			throw new BizError('API key name must contain 1 to 50 printable characters', 400);
		}
		if (!Number.isInteger(userId) || userId < 1) throw new BizError('Invalid API key user', 400);
		if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 1000) {
			throw new BizError('Rate limit must be between 1 and 1000 requests per minute', 400);
		}

		const user = await c.env.db.prepare(`
			SELECT user_id AS userId FROM user WHERE user_id = ? AND status = 0 AND is_del = 0
		`).bind(userId).first();
		if (!user) throw new BizError('API key user does not exist or is disabled', 400);

		const scopes = normalizeScopes(params.scopes);
		const allowedIps = normalizeAllowedIps(params.allowedIps);
		const expiresAt = normalizeExpiry(params.expiresAt);
		const secret = generateSecret();
		const keyHash = await hashSecret(secret);
		const keyPrefix = secret.slice(0, API_KEY_PREFIX.length + 8);
		const keySuffix = secret.slice(-4);

		const created = await c.env.db.prepare(`
			INSERT INTO api_key (
				name, key_prefix, key_suffix, key_hash, user_id, scopes, allowed_ips,
				rate_limit, status, expires_at, created_by
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
			RETURNING api_key_id AS apiKeyId
		`).bind(
			name,
			keyPrefix,
			keySuffix,
			keyHash,
			userId,
			JSON.stringify(scopes),
			JSON.stringify(allowedIps),
			rateLimit,
			expiresAt,
			createdBy
		).first();

		const key = await this.selectById(c, created.apiKeyId);
		return { ...key, secret };
	},

	async selectById(c, apiKeyId) {
		const row = await c.env.db.prepare(`
			SELECT k.api_key_id AS apiKeyId, k.name, k.key_prefix AS keyPrefix, k.key_suffix AS keySuffix,
			       k.user_id AS userId, u.username, u.display_name AS displayName,
			       k.scopes, k.allowed_ips AS allowedIps, k.rate_limit AS rateLimit, k.status,
			       k.expires_at AS expiresAt, k.last_used_at AS lastUsedAt, k.last_used_ip AS lastUsedIp,
			       k.created_by AS createdBy, creator.username AS creatorName, k.create_time AS createTime
			FROM api_key k
			LEFT JOIN user u ON u.user_id = k.user_id
			LEFT JOIN user creator ON creator.user_id = k.created_by
			WHERE k.api_key_id = ?
		`).bind(apiKeyId).first();
		return mapKey(row);
	},

	async list(c, params = {}) {
		const page = Math.max(1, Number(params.page) || 1);
		const size = Math.min(50, Math.max(1, Number(params.size) || 20));
		const search = typeof params.search === 'string' ? params.search.trim() : '';
		const status = params.status === undefined || params.status === '' ? null : Number(params.status);
		const conditions = [];
		const values = [];
		if (search) {
			conditions.push(`(k.name LIKE ? OR u.username LIKE ? OR k.key_prefix LIKE ?)`);
			values.push(`%${search}%`, `%${search}%`, `%${search}%`);
		}
		if ([0, 1, -1].includes(status)) {
			conditions.push(`k.status = ?`);
			values.push(status);
		}
		const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
		const { results = [] } = await c.env.db.prepare(`
			SELECT k.api_key_id AS apiKeyId, k.name, k.key_prefix AS keyPrefix, k.key_suffix AS keySuffix,
			       k.user_id AS userId, u.username, u.display_name AS displayName,
			       k.scopes, k.allowed_ips AS allowedIps, k.rate_limit AS rateLimit, k.status,
			       k.expires_at AS expiresAt, k.last_used_at AS lastUsedAt, k.last_used_ip AS lastUsedIp,
			       k.created_by AS createdBy, creator.username AS creatorName, k.create_time AS createTime
			FROM api_key k
			LEFT JOIN user u ON u.user_id = k.user_id
			LEFT JOIN user creator ON creator.user_id = k.created_by
			${where}
			ORDER BY k.api_key_id DESC LIMIT ? OFFSET ?
		`).bind(...values, size, (page - 1) * size).all();
		const totalRow = await c.env.db.prepare(`
			SELECT COUNT(*) AS total FROM api_key k LEFT JOIN user u ON u.user_id = k.user_id ${where}
		`).bind(...values).first();
		return { list: results.map(mapKey), total: Number(totalRow?.total || 0), page, size };
	},

	async setStatus(c, params) {
		const apiKeyId = Number(params?.apiKeyId);
		const status = Number(params?.status);
		if (!Number.isInteger(apiKeyId) || ![0, 1].includes(status)) throw new BizError('Invalid API key status', 400);
		const result = await c.env.db.prepare(`
			UPDATE api_key SET status = ? WHERE api_key_id = ? AND status != -1
		`).bind(status, apiKeyId).run();
		if (!changedRows(result)) throw new BizError('API key does not exist or has been revoked', 404);
		return this.selectById(c, apiKeyId);
	},

	async revoke(c, apiKeyId) {
		apiKeyId = Number(apiKeyId);
		if (!Number.isInteger(apiKeyId)) throw new BizError('Invalid API key', 400);
		const result = await c.env.db.prepare(`
			UPDATE api_key SET status = -1 WHERE api_key_id = ? AND status != -1
		`).bind(apiKeyId).run();
		if (!changedRows(result)) throw new BizError('API key does not exist or has already been revoked', 404);
		await c.env.db.prepare(`DELETE FROM api_rate_limit WHERE api_key_id = ?`).bind(apiKeyId).run();
	},

	async audit(c, params = {}) {
		const page = Math.max(1, Number(params.page) || 1);
		const size = Math.min(100, Math.max(1, Number(params.size) || 30));
		const apiKeyId = Number(params.apiKeyId) || null;
		const where = apiKeyId ? 'WHERE l.api_key_id = ?' : '';
		const values = apiKeyId ? [apiKeyId] : [];
		const { results = [] } = await c.env.db.prepare(`
			SELECT l.log_id AS logId, l.api_key_id AS apiKeyId, k.name AS keyName,
			       l.request_id AS requestId, l.method, l.path, l.status_code AS statusCode,
			       l.ip, l.duration_ms AS durationMs, l.create_time AS createTime
			FROM api_call_log l LEFT JOIN api_key k ON k.api_key_id = l.api_key_id
			${where} ORDER BY l.log_id DESC LIMIT ? OFFSET ?
		`).bind(...values, size, (page - 1) * size).all();
		const totalRow = await c.env.db.prepare(`SELECT COUNT(*) AS total FROM api_call_log l ${where}`)
			.bind(...values).first();
		return { list: results, total: Number(totalRow?.total || 0), page, size };
	},

	async authenticate(c) {
		const config = await c.env.db.prepare(`SELECT enabled FROM api_config WHERE config_id = 1`).first();
		if (config?.enabled !== 1) throw new BizError('Public API is disabled', 503);
		const authorization = c.req.header('Authorization') || '';
		const match = authorization.match(/^Bearer\s+(hpc_live_[a-f0-9]{64})$/i);
		if (!match) throw new BizError('Invalid API key', 401);
		const keyHash = await hashSecret(match[1]);
		const row = await c.env.db.prepare(`
			SELECT k.api_key_id AS apiKeyId, k.user_id AS userId, k.scopes, k.allowed_ips AS allowedIps,
			       k.rate_limit AS rateLimit, k.status, k.expires_at AS expiresAt,
			       u.status AS userStatus, u.is_del AS userDeleted
			FROM api_key k LEFT JOIN user u ON u.user_id = k.user_id WHERE k.key_hash = ?
		`).bind(keyHash).first();
		if (!row) throw new BizError('Invalid API key', 401);
		row.scopes = parseJsonArray(row.scopes);
		row.allowedIps = parseJsonArray(row.allowedIps);
		c.set('apiKey', row);

		if (row.status !== 1) throw new BizError('API key is disabled or revoked', 401);
		if (row.userStatus !== 0 || row.userDeleted !== 0) throw new BizError('API key user is disabled', 403);
		if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) throw new BizError('API key has expired', 401);
		const ip = clientIp(c);
		if (row.allowedIps.length && !row.allowedIps.includes(ip)) throw new BizError('Client IP is not allowed', 403);

		const windowStart = Math.floor(Date.now() / 60000);
		const rate = await c.env.db.prepare(`
			INSERT INTO api_rate_limit (api_key_id, window_start, request_count) VALUES (?, ?, 1)
			ON CONFLICT(api_key_id, window_start) DO UPDATE SET request_count = request_count + 1
			RETURNING request_count AS requestCount
		`).bind(row.apiKeyId, windowStart).first();
		const requestCount = Number(rate?.requestCount || 1);
		c.header('X-RateLimit-Limit', String(row.rateLimit));
		c.header('X-RateLimit-Remaining', String(Math.max(0, row.rateLimit - requestCount)));
		c.header('X-RateLimit-Reset', String((windowStart + 1) * 60));
		if (requestCount > row.rateLimit) throw new BizError('API rate limit exceeded', 429);

		await c.env.db.prepare(`
			UPDATE api_key SET last_used_at = CURRENT_TIMESTAMP, last_used_ip = ? WHERE api_key_id = ?
		`).bind(ip, row.apiKeyId).run();
		c.set('user', { userId: row.userId });
		c.set('apiClientIp', ip);
		c.set('apiPermKeys', await permService.userPermKeys(c, row.userId));
		return row;
	},

	assertScope(c, scope, requiredPerm = null) {
		const apiKey = c.get('apiKey');
		if (!apiKey?.scopes?.includes(scope)) throw new BizError(`API scope required: ${scope}`, 403);
		if (requiredPerm) {
			const permissions = c.get('apiPermKeys') || [];
			if (!permissions.includes('*') && !permissions.includes(requiredPerm)) {
				throw new BizError(`User permission required: ${requiredPerm}`, 403);
			}
		}
	},

	async recordAudit(c, statusCode, startedAt) {
		const apiKey = c.get('apiKey');
		if (!apiKey?.apiKeyId) return;
		await c.env.db.prepare(`
			INSERT INTO api_call_log (api_key_id, request_id, method, path, status_code, ip, duration_ms)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).bind(
			apiKey.apiKeyId,
			c.get('requestId') || '',
			c.req.method,
			c.req.path,
			Number(statusCode) || 500,
			c.get('apiClientIp') || clientIp(c),
			Math.max(0, Date.now() - startedAt)
		).run();
	},

	async cleanup(c) {
		const windowThreshold = Math.floor(Date.now() / 60000) - 1440;
		await Promise.all([
			c.env.db.prepare(`DELETE FROM api_rate_limit WHERE window_start < ?`).bind(windowThreshold).run(),
			c.env.db.prepare(`DELETE FROM api_call_log WHERE create_time < datetime('now', '-90 days')`).run()
		]);
	}
};

export { API_KEY_PREFIX, API_SCOPES, generateSecret, hashSecret, normalizeAllowedIps, normalizeScopes };
export default apiControlService;
