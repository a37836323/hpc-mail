import { describe, expect, it, vi } from 'vitest';
import schemaService from '../../src/service/schema-service';
import { FakeKV } from './test-utils';

describe('schema instance epoch', () => {
	it('reads through to D1 once and then uses KV', async () => {
		const kv = new FakeKV();
		const first = vi.fn().mockResolvedValue({ instance_epoch: 'epoch-current' });
		const c = { env: { kv, db: { prepare: vi.fn(() => ({ first })) } } };

		await expect(schemaService.instanceEpoch(c)).resolves.toBe('epoch-current');
		await expect(schemaService.instanceEpoch(c)).resolves.toBe('epoch-current');
		expect(first).toHaveBeenCalledOnce();
	});
});
