import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/entity/orm', () => ({ default: vi.fn() }));

import orm from '../../src/entity/orm';
import verifyRecordService from '../../src/service/verify-record-service';

describe('verification counter persistence', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.mocked(orm).mockReset();
	});

	it('returns the inserted row when creating the first registration counter', async () => {
		const inserted = { vrId: 1, ip: '198.51.100.20', count: 1, type: 0 };
		const get = vi.fn().mockResolvedValue(inserted);
		vi.mocked(orm).mockReturnValue({
			select: () => ({
				from: () => ({ where: () => ({ get: vi.fn().mockResolvedValue(null) }) })
			}),
			insert: () => ({
				values: () => ({ returning: () => ({ get }) })
			})
		});
		const c = { req: { header: name => name === 'CF-Connecting-IP' ? inserted.ip : '' } };

		await expect(verifyRecordService.increaseRegCount(c)).resolves.toEqual(inserted);
		expect(get).toHaveBeenCalledOnce();
	});
});
