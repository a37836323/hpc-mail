import { afterEach, describe, expect, it, vi } from 'vitest';
import publicService from '../../src/service/public-service';
import userService from '../../src/service/user-service';
import cryptoUtils from '../../src/utils/crypto-utils';
import loginRateLimitService from '../../src/service/login-rate-limit-service';
import { FakeKV, makeContext } from './test-utils';

describe('public admin token authentication', () => {
	afterEach(() => vi.restoreAllMocks());

	it('uses the shared login limiter, returns uniform failures, and blocks at the threshold', async () => {
		const c = makeContext(new FakeKV(), { 'CF-Connecting-IP': '203.0.113.80' });
		vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
		vi.spyOn(userService, 'selectByUsernameIncludeDel').mockResolvedValue(null);

		for (let attempt = 0; attempt < 5; attempt++) {
			await expect(publicService.verifyUser(c, { username: 'missing-admin', password: 'wrong' }))
				.rejects.toMatchObject({ code: 401 });
		}
		await expect(publicService.verifyUser(c, { username: 'missing-admin', password: 'wrong' }))
			.rejects.toMatchObject({ code: 429 });
	});

	it('resets the shared limiter after valid admin authentication', async () => {
		const kv = new FakeKV();
		const c = makeContext(kv, { 'CF-Connecting-IP': '203.0.113.81' });
		await loginRateLimitService.recordFailure(c, 'admin');
		expect(kv.values.size).toBe(2);
		vi.spyOn(userService, 'selectByUsernameIncludeDel').mockResolvedValue({
			userId: 1,
			username: 'admin',
			email: c.env.admin,
			password: 'stored-hash',
			salt: 'stored-salt',
			status: 0,
			isDel: 0
		});
		vi.spyOn(cryptoUtils, 'verifyPassword').mockResolvedValue(true);

		await expect(publicService.verifyUser(c, { username: 'admin', password: 'correct' })).resolves.toBeUndefined();
		expect(kv.values.size).toBe(0);
	});
});
