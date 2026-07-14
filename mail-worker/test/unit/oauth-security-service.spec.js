import { describe, expect, it } from 'vitest';
import oauthSecurityService, { OAUTH_BIND_TTL, OAUTH_FLOW_TTL } from '../../src/service/oauth-security-service';
import { FakeKV, makeContext } from './test-utils';

function cookieValue(setCookie) {
	return setCookie.match(/^hpc_oauth_flow=([^;]+)/)?.[1] || '';
}

describe('OAuth state and one-time bind ticket security', () => {
	it('binds a state to an HttpOnly browser cookie and consumes it once', async () => {
		const kv = new FakeKV();
		const start = makeContext(kv);
		const now = 1_700_000_000_000;
		const state = await oauthSecurityService.createFlow(start, now);
		const setCookie = start.responseHeaders.get('set-cookie');
		expect(setCookie).toContain('HttpOnly');
		expect(setCookie).toContain('SameSite=Lax');
		expect(setCookie).toContain('Secure');
		expect(kv.puts.at(-1).options.expirationTtl).toBe(OAUTH_FLOW_TTL);

		const callback = makeContext(kv, { Cookie: `hpc_oauth_flow=${cookieValue(setCookie)}` });
		await expect(oauthSecurityService.consumeFlow(callback, state, now + 1_000)).resolves.toBeUndefined();
		await expect(oauthSecurityService.consumeFlow(callback, state, now + 2_000)).rejects.toMatchObject({ code: 401 });
	});

	it.each([
		['missing', null],
		['tampered', 'tampered-ticket-that-is-long-enough-000000000'],
	])('rejects a %s bind ticket', async (_, bindTicket) => {
		const c = makeContext(new FakeKV());
		await expect(oauthSecurityService.claimBindTicket(c, bindTicket)).rejects.toMatchObject({ code: 401 });
	});

	it('accepts a bind ticket only once and rejects an expired ticket', async () => {
		const kv = new FakeKV();
		const c = makeContext(kv);
		const now = 1_700_000_000_000;
		const ticket = await oauthSecurityService.issueBindTicket(c, 'oauth-user-1', now);
		expect(kv.puts.some(put => put.options.expirationTtl === OAUTH_BIND_TTL)).toBe(true);
		const claim = await oauthSecurityService.claimBindTicket(c, ticket, now + 1_000);
		expect(claim.oauthUserId).toBe('oauth-user-1');
		claim.release();
		await expect(oauthSecurityService.claimBindTicket(c, ticket, now + 2_000)).rejects.toMatchObject({ code: 401 });

		const expired = await oauthSecurityService.issueBindTicket(c, 'oauth-user-2', now);
		await expect(oauthSecurityService.claimBindTicket(c, expired, now + OAUTH_BIND_TTL * 1000 + 1)).rejects.toMatchObject({ code: 401 });
	});
});
