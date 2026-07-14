import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/entity/orm', () => ({ default: vi.fn() }));

import orm from '../../src/entity/orm';
import oauthService from '../../src/service/oauth-service';
import oauthSecurityService from '../../src/service/oauth-security-service';
import loginService from '../../src/service/login-service';
import userService from '../../src/service/user-service';

describe('OAuth username binding contract', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.mocked(orm).mockReset();
	});

	it('accepts only an opaque one-time bind ticket and does not expose an OAuth id', async () => {
		const release = vi.fn();
		const claim = vi.spyOn(oauthSecurityService, 'claimBindTicket').mockResolvedValue({ oauthUserId: 'oauth-1', release });
		vi.spyOn(oauthService, 'getById').mockResolvedValue({ oauthUserId: 'oauth-1', userId: 0, username: 'remote-user' });
		const register = vi.spyOn(loginService, 'registerUsername').mockResolvedValue({ username: 'Riba2534' });
		vi.spyOn(userService, 'selectByUsernameIncludeDel').mockResolvedValue({ userId: 42, username: 'Riba2534' });
		vi.spyOn(loginService, 'login').mockResolvedValue('jwt-token');
		vi.mocked(orm).mockReturnValue({
			update: () => ({ set: () => ({ where: () => ({ returning: () => ({ get: vi.fn().mockResolvedValue({ userId: 42, username: 'remote-user' }) }) }) }) })
		});

		const result = await oauthService.bindUser({}, { username: ' Riba2534 ', bindTicket: 'opaque-ticket', code: 'invite' });

		expect(claim).toHaveBeenCalledWith({}, 'opaque-ticket');
		expect(register).toHaveBeenCalledWith({}, expect.objectContaining({ username: ' Riba2534 ', code: 'invite' }), true);
		expect(result).toEqual({
			userInfo: { suggestedUsername: 'remote-user', oauthUsername: 'remote-user' },
			token: 'jwt-token'
		});
		expect(JSON.stringify(result)).not.toContain('oauth-1');
		expect(release).toHaveBeenCalledOnce();
	});
});
