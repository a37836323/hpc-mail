import { describe, expect, it } from 'vitest';
import {
	buildLegacyAuthEmail,
	isValidUsername,
	migratedUsernamePreference,
	parseLoginIdentifier
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

	it('parses username login and both legacy email shapes', () => {
		expect(parseLoginIdentifier({ username: ' Riba2534 ' })).toEqual({ identifier: 'Riba2534', type: 'username' });
		expect(parseLoginIdentifier({ email: ' admin@hpc.email ' })).toEqual({ identifier: 'admin@hpc.email', type: 'email' });
		expect(parseLoginIdentifier({ username: 'admin@hpc.email' })).toEqual({ identifier: 'admin@hpc.email', type: 'email' });
	});

	it('uses a non-routable unique legacy placeholder for username-only users', () => {
		expect(buildLegacyAuthEmail(' Riba2534 ')).toBe('riba2534@auth.invalid');
	});

	it('prefers the matching mailbox account name during migration', () => {
		expect(migratedUsernamePreference('', 'riba2534', 'admin', 1)).toBe('riba2534');
		expect(migratedUsernamePreference('', '', 'admin', 1)).toBe('admin');
		expect(migratedUsernamePreference('Existing_User', 'riba2534', 'admin', 1)).toBe('Existing_User');
	});
});
