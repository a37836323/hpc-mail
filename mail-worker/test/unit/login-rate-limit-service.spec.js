import { describe, expect, it } from 'vitest';
import loginRateLimitService, { BACKOFF_THRESHOLD, WINDOW_SECONDS } from '../../src/service/login-rate-limit-service';
import { FakeKV, makeContext } from './test-utils';

describe('login rate limiting', () => {
	it('stores only hashed IP and identifier keys and applies bounded backoff', async () => {
		const kv = new FakeKV();
		const c = makeContext(kv, { 'CF-Connecting-IP': '198.51.100.12' });
		const now = 1_700_000_000_000;
		for (let count = 0; count < BACKOFF_THRESHOLD; count++) {
			await loginRateLimitService.recordFailure(c, 'Alice', now);
		}

		const keys = [...kv.values.keys()];
		expect(keys).toHaveLength(2);
		expect(keys.join(' ')).not.toContain('Alice');
		expect(keys.join(' ')).not.toContain('198.51.100.12');
		await expect(loginRateLimitService.assertAllowed(c, 'alice', now)).rejects.toMatchObject({ code: 429 });
		await expect(loginRateLimitService.assertAllowed(c, 'alice', now + 2_000)).resolves.toBeUndefined();
		for (const put of kv.puts) expect(put.options.expirationTtl).toBeLessThanOrEqual(WINDOW_SECONDS);
	});

	it('resets both the IP and normalized identifier counters after success', async () => {
		const kv = new FakeKV();
		const c = makeContext(kv, { 'X-Forwarded-For': '192.0.2.4' });
		await loginRateLimitService.recordFailure(c, '  UserName  ');
		expect(kv.values.size).toBe(2);
		await loginRateLimitService.reset(c, 'username');
		expect(kv.values.size).toBe(0);
	});
});
