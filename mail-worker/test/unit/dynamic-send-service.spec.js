import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/entity/orm', () => ({ default: vi.fn() }));

import orm from '../../src/entity/orm';
import emailService from '../../src/service/email-service';
import settingService from '../../src/service/setting-service';
import attService from '../../src/service/att-service';
import userService from '../../src/service/user-service';
import roleService from '../../src/service/role-service';
import accountService from '../../src/service/account-service';

describe('dynamic sender service integration', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.mocked(orm).mockReset();
	});

	it('persists the complete sender with accountId=0 and never creates or resolves an account', async () => {
		vi.spyOn(settingService, 'query').mockResolvedValue({
			resendTokens: {},
			r2Domain: '',
			send: 0,
			domainList: ['@hpc.email']
		});
		vi.spyOn(attService, 'toImageUrlHtml').mockResolvedValue({ imageDataList: [], html: '<p>Hello</p>' });
		vi.spyOn(attService, 'selectByEmailIds').mockResolvedValue([]);
		vi.spyOn(userService, 'selectById').mockResolvedValue({
			userId: 7,
			email: 'riba2534@auth.invalid',
			type: 1,
			sendCount: 0
		});
		vi.spyOn(roleService, 'selectById').mockResolvedValue({
			roleId: 1,
			sendType: 'count',
			sendCount: null,
			availDomain: 'hpc.email'
		});
		const accountLookup = vi.spyOn(accountService, 'selectById');
		vi.spyOn(emailService, 'HandleOnSiteEmail').mockResolvedValue();

		let inserted;
		vi.mocked(orm).mockReturnValue({
			insert: () => ({
				values: values => {
					inserted = values;
					return {
						returning: () => ({
							get: async () => ({ emailId: 99, ...values })
						})
					};
				}
			})
		});

		const c = {
			env: {
				domain: ['hpc.email'],
				admin: 'admin@hpc.email',
				kv: {
					get: vi.fn().mockResolvedValue(null),
					put: vi.fn().mockResolvedValue()
				}
			}
		};

		const result = await emailService.send(
			c,
			{
				from: { name: 'HPC Mail', localPart: 'billing', domain: 'hpc.email' },
				receiveEmail: ['recipient@hpc.email'],
				subject: 'Invoice',
				text: 'Hello',
				content: '<p>Hello</p>',
				attachments: []
			},
			7
		);

		expect(accountLookup).not.toHaveBeenCalled();
		expect(inserted).toEqual(expect.objectContaining({
			accountId: 0,
			userId: 7,
			sendEmail: 'billing@hpc.email',
			name: 'HPC Mail'
		}));
		expect(result[0]).toEqual(expect.objectContaining({ emailId: 99, accountId: 0, sendEmail: 'billing@hpc.email' }));
	});
});
