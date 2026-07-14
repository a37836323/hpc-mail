import { afterEach, describe, expect, it, vi } from 'vitest';
import loginService from '../../src/service/login-service';
import userService from '../../src/service/user-service';
import accountService from '../../src/service/account-service';
import settingService from '../../src/service/setting-service';
import roleService from '../../src/service/role-service';
import cryptoUtils, { PBKDF2_ITERATIONS } from '../../src/utils/crypto-utils';
import permService from '../../src/service/perm-service';
import { FakeKV, makeContext } from './test-utils';

describe('username authentication service', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('does not reveal whether a username exists', async () => {
		const c = makeContext(new FakeKV(), { 'CF-Connecting-IP': '203.0.113.1' });
		vi.spyOn(userService, 'selectByUsernameIncludeDel').mockResolvedValueOnce(null);
		let missingError;
		try {
			await loginService.login(c, { username: 'missing-user', password: 'secret' });
		} catch (error) {
			missingError = error;
		}

		vi.spyOn(userService, 'selectByUsernameIncludeDel').mockResolvedValueOnce({
			userId: 1,
			email: 'known-user@auth.invalid',
			username: 'known-user',
			password: 'hash',
			salt: 'salt',
			status: 0,
			isDel: 0
		});
		vi.spyOn(cryptoUtils, 'verifyPassword').mockResolvedValue(false);
		let passwordError;
		try {
			await loginService.login(c, { username: 'known-user', password: 'wrong-secret' });
		} catch (error) {
			passwordError = error;
		}

		expect({ message: missingError.message, code: missingError.code }).toEqual({
			message: passwordError.message,
			code: passwordError.code
		});
		expect(missingError.code).toBe(401);
	});

	it('lazily upgrades a legacy password after a successful login', async () => {
		const kv = new FakeKV();
		const c = makeContext(kv, { 'CF-Connecting-IP': '203.0.113.2' });
		const legacySalt = 'legacy-salt';
		const legacyHash = await cryptoUtils.genHashPassword('secret123', legacySalt);
		vi.spyOn(userService, 'selectByUsernameIncludeDel').mockResolvedValue({
			userId: 9,
			username: 'legacy-user',
			email: 'legacy-user@auth.invalid',
			password: legacyHash,
			salt: legacySalt,
			status: 0,
			isDel: 0
		});
		vi.spyOn(userService, 'updateUserInfo').mockResolvedValue();
		const updateHash = vi.spyOn(userService, 'updatePasswordHash').mockResolvedValue();

		const token = await loginService.login(c, { username: 'legacy-user', password: 'secret123' });

		expect(token.split('.')).toHaveLength(3);
		expect(updateHash).toHaveBeenCalledWith(c, 9, expect.stringMatching(new RegExp(`^pbkdf2-sha256\\$${PBKDF2_ITERATIONS}\\$`)), expect.any(String));
		const stored = await kv.get('auth-uid:9', { type: 'json' });
		expect(stored.user).not.toHaveProperty('password');
		expect(stored.user).not.toHaveProperty('salt');
	});

	it('registers a username identity without creating a mailbox account', async () => {
		vi.spyOn(settingService, 'query').mockResolvedValue({
			regKey: 1,
			register: 0,
			registerVerify: 1,
			regVerifyCount: 1
		});
		vi.spyOn(userService, 'selectByUsernameIncludeDel').mockResolvedValue(null);
		vi.spyOn(userService, 'selectByEmailIncludeDel').mockResolvedValue(null);
		vi.spyOn(roleService, 'selectDefaultRole').mockResolvedValue({ roleId: 1 });
		vi.spyOn(roleService, 'selectById').mockResolvedValue({ roleId: 1 });
		vi.spyOn(cryptoUtils, 'hashPassword').mockResolvedValue({ salt: 'salt', hash: 'hash' });
		const insert = vi.spyOn(userService, 'insert').mockResolvedValue(42);
		vi.spyOn(userService, 'updateUserInfo').mockResolvedValue();
		const accountInsert = vi.spyOn(accountService, 'insert').mockResolvedValue();

		const result = await loginService.registerUsername({}, { username: 'Riba2534', password: 'secret123' });

		expect(result).toEqual({ regVerifyOpen: false, username: 'Riba2534' });
		expect(insert).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				username: 'Riba2534',
				email: 'riba2534@auth.invalid',
				displayName: 'Riba2534'
			})
		);
		expect(accountInsert).not.toHaveBeenCalled();
	});

	it('returns safe login user info when the identity has no mailbox account', async () => {
		vi.spyOn(userService, 'selectById').mockResolvedValue({
			userId: 42,
			username: 'Riba2534',
			displayName: 'Riba',
			email: 'riba2534@auth.invalid',
			type: 1,
			sendCount: 0
		});
		vi.spyOn(accountService, 'selectDefaultByUserId').mockResolvedValue(null);
		vi.spyOn(roleService, 'selectById').mockResolvedValue({ roleId: 1, name: 'user' });
		vi.spyOn(permService, 'userPermKeys').mockResolvedValue(['email:send']);

		const result = await userService.loginUserInfo({ env: { admin: 'admin@hpc.email' } }, 42);

		expect(result).toEqual(expect.objectContaining({
			username: 'Riba2534',
			displayName: 'Riba',
			name: 'Riba',
			email: null,
			legacyEmail: null,
			account: null
		}));
	});
});
