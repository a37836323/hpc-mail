import { describe, expect, it } from 'vitest';
import {
	isAdminRole,
	isValidUsername,
	normalizeUsername,
	usernameBase
} from '../../src/utils/auth-utils';

describe('username identity helpers', () => {
	it('validates the public username contract', () => {
		expect(isValidUsername('riba2534')).toBe(true);
		expect(isValidUsername('HPC_mail-2')).toBe(true);
		expect(isValidUsername('ab')).toBe(false);
		expect(isValidUsername('.admin')).toBe(false);
		expect(isValidUsername('admin.')).toBe(false);
		expect(isValidUsername('admin..ops')).toBe(false);
		expect(isValidUsername('admin@example.com')).toBe(false);
	});

	it('normalizes usernames without accepting email addresses', () => {
		expect(normalizeUsername(' Riba2534 ')).toBe('Riba2534');
		expect(isValidUsername('admin@hpc.email')).toBe(false);
	});

	it('generates valid username suggestions', () => {
		expect(usernameBase(' Riba 2534 ')).toBe('riba-2534');
	});

	it('recognizes only the dedicated admin role key', () => {
		expect(isAdminRole({ key: 'admin' })).toBe(true);
		expect(isAdminRole({ key: 'user', name: 'admin' })).toBe(false);
	});
});
