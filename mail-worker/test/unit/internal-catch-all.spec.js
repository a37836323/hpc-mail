import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/entity/orm', () => ({ default: vi.fn() }));

import orm from '../../src/entity/orm';
import emailService from '../../src/service/email-service';
import settingService from '../../src/service/setting-service';
import userService from '../../src/service/user-service';
import roleService from '../../src/service/role-service';
import { emailConst, settingConst } from '../../src/const/entity-const';

describe('on-site catch-all delivery', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.mocked(orm).mockReset();
	});

	it('persists an unknown local recipient under the admin user and account zero', async () => {
		const inserted = [];
		vi.mocked(orm).mockReturnValue({
			select: () => ({ from: () => ({ where: () => ({ all: vi.fn().mockResolvedValue([]) }) }) }),
			insert: () => ({
				values: values => {
					inserted.push(values);
					return { returning: () => ({ get: vi.fn().mockResolvedValue({ emailId: 88, ...values }) }) };
				}
			}),
			update: () => ({ set: () => ({ where: () => ({ run: vi.fn().mockResolvedValue() }) }) })
		});
		vi.spyOn(settingService, 'query').mockResolvedValue({ noRecipient: settingConst.noRecipient.OPEN });
		vi.spyOn(roleService, 'selectByUserIds').mockResolvedValue([]);
		vi.spyOn(userService, 'selectSystemAdmin').mockResolvedValue({ userId: 1, username: 'root', type: 1 });

		await emailService.HandleOnSiteEmail({}, ['random-prefix@hpc.email'], {
			emailId: 20,
			userId: 9,
			accountId: 3,
			sendEmail: 'sender@hpc.email'
		}, []);

		expect(inserted).toHaveLength(1);
		expect(inserted[0]).toMatchObject({
			toEmail: 'random-prefix@hpc.email',
			userId: 1,
			accountId: 0,
			type: emailConst.type.RECEIVE,
			status: emailConst.status.RECEIVE
		});
	});
});
