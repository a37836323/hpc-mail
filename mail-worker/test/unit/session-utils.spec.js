import { describe, expect, it, vi } from 'vitest';
import jwtUtils from '../../src/utils/jwt-utils';
import { addSessionToken, isSessionExpired, putAuthInfo, removeSessionToken } from '../../src/utils/session-utils';
import constant from '../../src/const/constant';
import { FakeKV, makeContext } from './test-utils';

describe('absolute session lifetime', () => {
	it('always emits JWT exp and rejects expired tokens', async () => {
		const c = makeContext();
		vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
		const token = await jwtUtils.generateToken(c, { userId: 1, token: 'device-a' }, 30);
		const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
		expect(payload.exp - payload.iat).toBe(30);
		await expect(jwtUtils.verifyToken(c, token)).resolves.toMatchObject({ userId: 1 });
		vi.spyOn(Date, 'now').mockReturnValue(1_700_000_031_000);
		await expect(jwtUtils.verifyToken(c, token)).resolves.toBeNull();
		vi.restoreAllMocks();
	});

	it('removes one device without extending the absolute KV expiry', async () => {
		const now = 1_700_000_000_000;
		const user = { userId: 7, username: 'user', passwordHash: 'secret-hash' };
		let authInfo = addSessionToken(null, 'device-a', user, now);
		authInfo = addSessionToken(authInfo, 'device-b', user, now + 1_000);
		removeSessionToken(authInfo, 'device-a');
		expect(authInfo.tokens).toEqual(['device-b']);
		expect(authInfo.user).not.toHaveProperty('passwordHash');

		const kv = new FakeKV();
		const c = makeContext(kv);
		await putAuthInfo(c, 7, authInfo, now + 60_000);
		// The second login happened one second later, so the session record is kept
		// only until the latest device JWT can still be valid. This rewrite adds no TTL.
		expect(kv.puts[0].options.expirationTtl).toBe(constant.TOKEN_EXPIRE - 59);
		expect(isSessionExpired(authInfo, now + constant.TOKEN_EXPIRE * 1000 + 1_001)).toBe(true);
	});
});
