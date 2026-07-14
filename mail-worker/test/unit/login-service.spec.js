import { afterEach, describe, expect, it, vi } from 'vitest';
import loginService from '../../src/service/login-service';
import userService from '../../src/service/user-service';
import accountService from '../../src/service/account-service';
import settingService from '../../src/service/setting-service';
import roleService from '../../src/service/role-service';
import cryptoUtils from '../../src/utils/crypto-utils';
import permService from '../../src/service/perm-service';
import schemaService from '../../src/service/schema-service';
import jwtUtils from '../../src/utils/jwt-utils';
import { FakeKV, makeContext } from './test-utils';

describe('username authentication service', () => {
	afterEach(() => vi.restoreAllMocks());

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
			username: 'known-user',
			passwordHash: 'hash',
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

	it('does not fall back to an email identifier', async () => {
		const c = makeContext(new FakeKV(), { 'CF-Connecting-IP': '203.0.113.2' });
		const lookup = vi.spyOn(userService, 'selectByUsernameIncludeDel');

		await expect(loginService.login(c, { email: 'admin@hpc.email', password: 'secret123' }))
			.rejects.toMatchObject({ code: 401 });
		expect(lookup).not.toHaveBeenCalled();
	});

	it('binds successful login tokens to the current database epoch', async () => {
		const c = makeContext(new FakeKV(), { 'CF-Connecting-IP': '203.0.113.3' });
		vi.spyOn(userService, 'selectByUsernameIncludeDel').mockResolvedValue({
			userId: 9,
			username: 'current-user',
			passwordHash: 'current-hash',
			status: 0,
			isDel: 0
		});
		vi.spyOn(cryptoUtils, 'verifyPassword').mockResolvedValue(true);
		vi.spyOn(schemaService, 'instanceEpoch').mockResolvedValue('epoch-current');
		vi.spyOn(userService, 'updateUserInfo').mockResolvedValue();

		const token = await loginService.login(c, { username: 'current-user', password: 'test-credential' });
		await expect(jwtUtils.verifyToken(c, token)).resolves.toMatchObject({
			userId: 9,
			instanceEpoch: 'epoch-current'
		});
	});

	it('registers a username identity without creating a mailbox account', async () => {
		vi.spyOn(settingService, 'query').mockResolvedValue({
			regKey: 1,
			register: 0,
			registerVerify: 1,
			regVerifyCount: 1
		});
		vi.spyOn(userService, 'selectByUsernameIncludeDel').mockResolvedValue(null);
		vi.spyOn(roleService, 'selectDefaultRole').mockResolvedValue({ roleId: 2 });
		vi.spyOn(roleService, 'selectById').mockResolvedValue({ roleId: 2 });
		vi.spyOn(cryptoUtils, 'hashPassword').mockResolvedValue({ hash: 'hash' });
		const insert = vi.spyOn(userService, 'insert').mockResolvedValue(42);
		vi.spyOn(userService, 'updateUserInfo').mockResolvedValue();
		const accountInsert = vi.spyOn(accountService, 'insert').mockResolvedValue();

		const result = await loginService.registerUsername({}, { username: 'Riba2534', password: 'secret123' });

		expect(result).toEqual({ regVerifyOpen: false, username: 'Riba2534' });
		expect(insert).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				username: 'Riba2534',
				displayName: 'Riba2534',
				passwordHash: 'hash'
			})
		);
		expect(insert.mock.calls[0][1]).not.toHaveProperty('email');
		expect(accountInsert).not.toHaveBeenCalled();
	});

		it('returns a platform identity without singling out a mailbox', async () => {
		vi.spyOn(userService, 'selectById').mockResolvedValue({
			userId: 42,
			username: 'Riba2534',
			displayName: 'Riba',
			type: 2,
			sendCount: 0
		});
			vi.spyOn(roleService, 'selectById').mockResolvedValue({ roleId: 2, key: 'user', name: 'user' });
		vi.spyOn(permService, 'userPermKeys').mockResolvedValue(['email:send']);

		const result = await userService.loginUserInfo({ env: {} }, 42);

		expect(result).toEqual(expect.objectContaining({
			username: 'Riba2534',
				displayName: 'Riba',
				name: 'Riba',
				type: 2
			}));
			expect(result).not.toHaveProperty('defaultAccount');
		expect(result).not.toHaveProperty('email');
		expect(result).not.toHaveProperty('legacyEmail');
		expect(result).not.toHaveProperty('account');
	});
});
