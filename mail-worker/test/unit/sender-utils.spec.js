import { describe, expect, it } from 'vitest';
import { buildDynamicSender, validateLocalPart } from '../../src/utils/sender-utils';
import roleService from '../../src/service/role-service';

describe('dynamic sender validation', () => {
	it('builds a sender without creating an account and accepts an @-prefixed domain', () => {
		expect(
			buildDynamicSender(
				{ name: 'HPC Mail', localPart: 'billing', domain: '@hpc.email' },
				['hpc.email', 'option.red'],
				'hpc.email'
			)
		).toEqual({
			accountId: 0,
			accountEmail: 'billing@hpc.email',
			name: 'HPC Mail',
			localPart: 'billing',
			domain: 'hpc.email'
		});
	});

	it.each(['.billing', 'billing.', 'bill..ing', '', 'has space', 'a'.repeat(65)])('rejects invalid local part %j', localPart => {
		expect(() => validateLocalPart(localPart)).toThrow();
	});

	it('rejects an unconfigured domain', () => {
		expect(() => buildDynamicSender({ localPart: 'billing', domain: 'evil.example' }, ['hpc.email'], '')).toThrow();
	});

	it('rejects a configured but unauthorized domain', () => {
		try {
			buildDynamicSender({ localPart: 'billing', domain: 'option.red' }, ['hpc.email', 'option.red'], 'hpc.email');
			throw new Error('expected authorization failure');
		} catch (error) {
			expect(error.name).toBe('BizError');
			expect(error.code).toBe(403);
		}
	});

	it('treats wildcard role permission as all configured domains, never arbitrary domains', () => {
		expect(
			buildDynamicSender({ localPart: 'billing', domain: 'option.red' }, ['hpc.email', 'option.red'], '*')
		).toMatchObject({ accountEmail: 'billing@option.red' });
		expect(() => buildDynamicSender({ localPart: 'billing', domain: 'evil.example' }, ['hpc.email'], '*')).toThrow();
	});

	it('uses the same wildcard semantics for account and receive paths', () => {
		expect(roleService.hasAvailDomainPerm('*', 'billing@hpc.email')).toBe(true);
		expect(roleService.hasAvailDomainPerm('option.red,*', 'billing@hpc.email')).toBe(true);
	});

	it('rejects CRLF header injection', () => {
		expect(() => buildDynamicSender({ name: 'HPC\r\nBcc: victim@example.com', localPart: 'billing', domain: 'hpc.email' }, ['hpc.email'], '')).toThrow();
	});
});
