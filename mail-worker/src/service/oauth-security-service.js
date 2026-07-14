import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const OAUTH_FLOW_TTL = 10 * 60;
const OAUTH_BIND_TTL = 10 * 60;
const OAUTH_FLOW_COOKIE = 'hpc_oauth_flow';
const encoder = new TextEncoder();
const consumingTickets = new Set();

function randomToken(byteLength = 32) {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function digest(value) {
	const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
	return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function parseCookies(header = '') {
	return Object.fromEntries(header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
		const index = part.indexOf('=');
		if (index < 0) return [part, ''];
		try {
			return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
		} catch (_) {
			return [part.slice(0, index), ''];
		}
	}));
}

function setFlowCookie(c, value, maxAge) {
	const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
	c.header('Set-Cookie', `${OAUTH_FLOW_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

const oauthSecurityService = {
	async createFlow(c, now = Date.now()) {
		const state = randomToken();
		const browserNonce = randomToken();
		const [stateHash, nonceHash] = await Promise.all([digest(state), digest(browserNonce)]);
		await c.env.kv.put(`oauth-flow:${stateHash}`, JSON.stringify({ nonceHash, expiresAt: now + OAUTH_FLOW_TTL * 1000 }), {
			expirationTtl: OAUTH_FLOW_TTL
		});
		setFlowCookie(c, browserNonce, OAUTH_FLOW_TTL);
		return state;
	},

	async consumeFlow(c, state, now = Date.now()) {
		if (typeof state !== 'string' || state.length < 32) throw new BizError(t('invalidOAuthFlow'), 401);
		const browserNonce = parseCookies(c.req.header('Cookie') || '')[OAUTH_FLOW_COOKIE];
		if (!browserNonce) throw new BizError(t('invalidOAuthFlow'), 401);
		const stateHash = await digest(state);
		const key = `oauth-flow:${stateHash}`;
		const record = await c.env.kv.get(key, { type: 'json' });
		await c.env.kv.delete(key);
		setFlowCookie(c, '', 0);
		if (!record || Number(record.expiresAt) <= now || record.nonceHash !== await digest(browserNonce)) {
			throw new BizError(t('invalidOAuthFlow'), 401);
		}
	},

	async issueBindTicket(c, oauthUserId, now = Date.now()) {
		const bindTicket = randomToken();
		const [ticketHash, identityHash] = await Promise.all([digest(bindTicket), digest(`linuxdo:${oauthUserId}`)]);
		const activeKey = `oauth-bind-active:${identityHash}`;
		const previousHash = await c.env.kv.get(activeKey);
		if (previousHash) await c.env.kv.delete(`oauth-bind-ticket:${previousHash}`);
		await Promise.all([
			c.env.kv.put(`oauth-bind-ticket:${ticketHash}`, JSON.stringify({ oauthUserId, identityHash, expiresAt: now + OAUTH_BIND_TTL * 1000 }), {
				expirationTtl: OAUTH_BIND_TTL
			}),
			c.env.kv.put(activeKey, ticketHash, { expirationTtl: OAUTH_BIND_TTL })
		]);
		return bindTicket;
	},

	async claimBindTicket(c, bindTicket, now = Date.now()) {
		if (typeof bindTicket !== 'string' || bindTicket.length < 32) throw new BizError(t('invalidOAuthBindTicket'), 401);
		const ticketHash = await digest(bindTicket);
		if (consumingTickets.has(ticketHash)) throw new BizError(t('invalidOAuthBindTicket'), 401);
		consumingTickets.add(ticketHash);
		try {
			const ticketKey = `oauth-bind-ticket:${ticketHash}`;
			const record = await c.env.kv.get(ticketKey, { type: 'json' });
			const activeKey = record?.identityHash ? `oauth-bind-active:${record.identityHash}` : '';
			const activeHash = activeKey ? await c.env.kv.get(activeKey) : null;
			await c.env.kv.delete(ticketKey);
			if (activeKey) await c.env.kv.delete(activeKey);
			if (!record || activeHash !== ticketHash || Number(record.expiresAt) <= now) {
				throw new BizError(t('invalidOAuthBindTicket'), 401);
			}
			return {
				oauthUserId: record.oauthUserId,
				release: () => consumingTickets.delete(ticketHash)
			};
		} catch (error) {
			consumingTickets.delete(ticketHash);
			throw error;
		}
	}
};

export { OAUTH_FLOW_TTL, OAUTH_BIND_TTL, OAUTH_FLOW_COOKIE, randomToken };
export default oauthSecurityService;
