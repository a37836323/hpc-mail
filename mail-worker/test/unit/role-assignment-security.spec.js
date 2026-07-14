import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/entity/orm', () => ({ default: vi.fn() }));

import orm from '../../src/entity/orm';
import regKeyService from '../../src/service/reg-key-service';
import roleService from '../../src/service/role-service';
import userService from '../../src/service/user-service';
import cryptoUtils from '../../src/utils/crypto-utils';

describe('role assignment security', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.mocked(orm).mockReset();
	});

	it.each([
		[null],
		[{ roleId: 1, key: 'admin', isSystem: 1 }]
	])('rejects registration keys targeting unavailable or privileged roles', async roleRow => {
		const insert = vi.fn();
		vi.mocked(orm).mockReturnValue({
			select: () => ({
				from: () => ({ where: () => ({ get: vi.fn().mockResolvedValue(null) }) })
			}),
			insert
		});
		vi.spyOn(roleService, 'selectById').mockResolvedValue(roleRow);

		await expect(regKeyService.add({}, {
			code: crypto.randomUUID(),
			roleId: roleRow?.roleId || 999,
			count: 1,
			expireTime: new Date(Date.now() + 86_400_000).toISOString()
		}, 1)).rejects.toBeDefined();
		expect(insert).not.toHaveBeenCalled();
	});

	it('allows registration keys to use the protected built-in ordinary role', async () => {
		const run = vi.fn().mockResolvedValue();
		vi.mocked(orm).mockReturnValue({
			select: () => ({
				from: () => ({ where: () => ({ get: vi.fn().mockResolvedValue(null) }) })
			}),
			insert: () => ({ values: () => ({ run }) })
		});
		vi.spyOn(roleService, 'selectById').mockResolvedValue({ roleId: 2, key: 'user', isSystem: 1 });

		await expect(regKeyService.add({}, {
			code: crypto.randomUUID(),
			roleId: 2,
			count: 1,
			expireTime: new Date(Date.now() + 86_400_000).toISOString()
		}, 1)).resolves.toBeUndefined();
		expect(run).toHaveBeenCalledOnce();
	});

	it('rejects direct user creation with the admin role', async () => {
		vi.spyOn(userService, 'selectByUsernameIncludeDel').mockResolvedValue(null);
		vi.spyOn(roleService, 'selectById').mockResolvedValue({ roleId: 1, key: 'admin', isSystem: 1 });
		const hash = vi.spyOn(cryptoUtils, 'hashPassword');

		await expect(userService.add({}, {
			username: 'ordinary-user',
			password: 'test-credential',
			type: 1
		})).rejects.toBeDefined();
		expect(hash).not.toHaveBeenCalled();
	});

	it('checks administrator protection before resetting another user password', async () => {
		const protection = vi.spyOn(userService, 'assertMutableUser').mockRejectedValue(Object.assign(new Error('forbidden'), { code: 403 }));
		const reset = vi.spyOn(userService, 'resetPassword');

		await expect(userService.setPwd({}, { userId: 1, password: 'test-credential' }))
			.rejects.toMatchObject({ code: 403 });
		expect(protection).toHaveBeenCalledWith({}, 1);
		expect(reset).not.toHaveBeenCalled();
	});
});
