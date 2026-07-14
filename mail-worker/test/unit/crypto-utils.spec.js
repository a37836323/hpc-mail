import { describe, expect, it, vi } from 'vitest';
import cryptoUtils, { PBKDF2_ITERATIONS, PBKDF2_MAX_ITERATIONS } from '../../src/utils/crypto-utils';

describe('password hashing', () => {
	it('uses a versioned PBKDF2-SHA256 hash with the hardened iteration count', async () => {
		const { hash } = await cryptoUtils.hashPassword('correct horse battery staple');
		expect(hash.split('$')[2].length).toBeGreaterThanOrEqual(20);
		expect(hash).toMatch(new RegExp(`^pbkdf2-sha256\\$${PBKDF2_ITERATIONS}\\$`));
		await expect(cryptoUtils.verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
		await expect(cryptoUtils.verifyPassword('wrong password', hash)).resolves.toBe(false);
	});

	it('rejects unversioned legacy credentials', async () => {
		await expect(cryptoUtils.verifyPassword('secret123', 'unversioned-legacy-hash')).resolves.toBe(false);
	});

	it('rejects PBKDF2 hashes above the Cloudflare Workers limit before calling WebCrypto', async () => {
		const derivePbkdf2 = vi.spyOn(cryptoUtils, 'derivePbkdf2');
		const unsupportedHash = `pbkdf2-sha256$${PBKDF2_MAX_ITERATIONS + 1}$c2FsdA$aGFzaA`;

		await expect(cryptoUtils.verifyPassword('secret123', unsupportedHash)).resolves.toBe(false);
		expect(derivePbkdf2).not.toHaveBeenCalled();
	});

	it('generates independent cryptographically random credentials', () => {
		const values = new Set(Array.from({ length: 32 }, () => cryptoUtils.genRandomPwd()));
		expect(values.size).toBe(32);
		for (const value of values) expect(value).toMatch(/^[A-Za-z0-9]{16}$/);
	});
});
