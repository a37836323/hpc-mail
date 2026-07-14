import BizError from '../error/biz-error';
import reqUtils from '../utils/req-utils';
import { t } from '../i18n/i18n';
import KvConst from '../const/kv-const';

const WINDOW_SECONDS = 15 * 60;
const BACKOFF_THRESHOLD = 5;
const MAX_BACKOFF_SECONDS = 5 * 60;
const encoder = new TextEncoder();

async function digest(value) {
	const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
	return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

const loginRateLimitService = {
	async keys(c, identifier) {
		const rawIp = reqUtils.getIp(c).split(',')[0].trim().toLowerCase();
		const normalizedIdentifier = String(identifier || '<missing>').trim().toLowerCase();
		const [ipHash, identifierHash] = await Promise.all([digest(`ip:${rawIp}`), digest(`id:${normalizedIdentifier}`)]);
		return [`${KvConst.LOGIN_FAILURE}ip:${ipHash}`, `${KvConst.LOGIN_FAILURE}id:${identifierHash}`];
	},

	async assertAllowed(c, identifier, now = Date.now()) {
		const nowValue = Math.floor(now / 1000);
		const keys = await this.keys(c, identifier);
		const records = await Promise.all(keys.map(key => c.env.kv.get(key, { type: 'json' })));
		if (records.some(record => record && Number(record.blockedUntil) > nowValue)) {
			throw new BizError(t('tooManyLoginAttempts'), 429);
		}
	},

	async recordFailure(c, identifier, now = Date.now()) {
		const nowValue = Math.floor(now / 1000);
		const keys = await this.keys(c, identifier);
		await Promise.all(keys.map(async key => {
			let record = await c.env.kv.get(key, { type: 'json' });
			if (!record || Number(record.resetAt) <= nowValue) {
				record = { count: 0, resetAt: nowValue + WINDOW_SECONDS, blockedUntil: 0 };
			}
			record.count = Number(record.count || 0) + 1;
			if (record.count >= BACKOFF_THRESHOLD) {
				const backoff = Math.min(MAX_BACKOFF_SECONDS, 2 ** (record.count - BACKOFF_THRESHOLD));
				record.blockedUntil = nowValue + backoff;
			}
			await c.env.kv.put(key, JSON.stringify(record), {
				expirationTtl: Math.max(60, Number(record.resetAt) - nowValue)
			});
		}));
	},

	async reset(c, identifier) {
		const keys = await this.keys(c, identifier);
		await Promise.all(keys.map(key => c.env.kv.delete(key)));
	}
};

export { WINDOW_SECONDS, BACKOFF_THRESHOLD, MAX_BACKOFF_SECONDS };
export default loginRateLimitService;
