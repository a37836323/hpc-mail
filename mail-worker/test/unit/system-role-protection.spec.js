import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/entity/orm', () => ({ default: vi.fn() }));

import orm from '../../src/entity/orm';
import roleService from '../../src/service/role-service';
import userService from '../../src/service/user-service';

describe('system administrator protection', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.mocked(orm).mockReset();
	});

	it('blocks all user mutation paths for the admin-role owner', async () => {
		vi.spyOn(userService, 'selectByIdIncludeDel').mockResolvedValue({ userId: 1, type: 1, username: 'root' });
		vi.spyOn(roleService, 'selectById').mockResolvedValue({ roleId: 1, key: 'admin', isSystem: 1 });

		await expect(userService.assertMutableUser({}, 1)).rejects.toMatchObject({ code: 403 });
	});

	it('does not allow deleting the admin system role', async () => {
		vi.mocked(orm).mockReturnValue({
			select: () => ({
				from: () => ({
					where: () => ({ get: vi.fn().mockResolvedValue({ roleId: 1, key: 'admin', isSystem: 1, isDefault: 0 }) })
				})
			})
		});

		await expect(roleService.delete({}, { roleId: 1 })).rejects.toBeDefined();
	});

	it('does not allow editing a system role', async () => {
		vi.spyOn(roleService, 'selectById').mockResolvedValue({ roleId: 1, key: 'admin', isSystem: 1 });

		await expect(roleService.setRole({}, {
			roleId: 1,
			name: 'changed',
			permIds: [],
			banEmail: [],
			availDomain: []
		})).rejects.toMatchObject({ code: 403 });
	});

	it('allows the built-in ordinary role to be restored as default', async () => {
		const run = vi.fn().mockResolvedValue();
		vi.mocked(orm).mockReturnValue({
			select: () => ({
				from: () => ({ where: () => ({ get: vi.fn().mockResolvedValue({ roleId: 2, key: 'user', isSystem: 1 }) }) })
			}),
			update: () => ({
				set: () => ({ run, where: () => ({ run }) })
			})
		});

		await expect(roleService.setDefault({}, { roleId: 2 })).resolves.toBeUndefined();
		expect(run).toHaveBeenCalledTimes(2);
	});
});
