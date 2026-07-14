import { afterEach, describe, expect, it, vi } from 'vitest';
import { email as receiveEmail } from '../../src/email/email';
import emailService from '../../src/service/email-service';
import accountService from '../../src/service/account-service';
import settingService from '../../src/service/setting-service';
import userService from '../../src/service/user-service';
import aiService from '../../src/service/ai-service';
import { emailConst, settingConst } from '../../src/const/entity-const';

describe('external catch-all delivery', () => {
	afterEach(() => vi.restoreAllMocks());

	it('assigns an unknown configured-domain address only to the active admin user', async () => {
		vi.spyOn(settingService, 'query').mockResolvedValue({
			receive: settingConst.receive.OPEN,
			tgChatId: '',
			tgBotStatus: settingConst.tgBotStatus.CLOSE,
			forwardStatus: settingConst.forwardStatus.CLOSE,
			forwardEmail: '',
			ruleEmail: '',
			ruleType: settingConst.ruleType.ALL,
			r2Domain: '',
			noRecipient: settingConst.noRecipient.OPEN,
			blackSubject: '',
			blackContent: '',
			blackFrom: '',
			aiCode: settingConst.aiCode.CLOSE,
			aiCodeFilter: ''
		});
		vi.spyOn(accountService, 'selectByEmailIncludeDel').mockResolvedValue(null);
		vi.spyOn(userService, 'selectSystemAdmin').mockResolvedValue({ userId: 1, username: 'root', type: 1 });
		vi.spyOn(aiService, 'extractCode').mockResolvedValue('');
		let saved;
		vi.spyOn(emailService, 'receive').mockImplementation(async (_c, params) => {
			saved = params;
			return { emailId: 77, ...params };
		});
		const complete = vi.spyOn(emailService, 'completeReceive').mockImplementation(async (_c, status, emailId) => ({ emailId, status, ...saved }));
		const reject = vi.fn();
		const raw = [
			'From: Sender <sender@example.net>',
			'To: random-prefix@hpc.email',
			'Subject: catch-all',
			'Message-ID: <catch-all@example.net>',
			'MIME-Version: 1.0',
			'Content-Type: text/plain; charset=utf-8',
			'',
			'hello'
		].join('\r\n');
		const message = {
			to: 'random-prefix@hpc.email',
			raw: new Response(raw).body,
			setReject: reject,
			forward: vi.fn()
		};

		await receiveEmail(message, {}, {});

		expect(reject).not.toHaveBeenCalled();
		expect(saved).toMatchObject({
			toEmail: 'random-prefix@hpc.email',
			userId: 1,
			accountId: 0,
			status: emailConst.status.SAVING
		});
		expect(complete).toHaveBeenCalledWith({ env: {} }, emailConst.status.RECEIVE, 77);
	});

	it('preserves explicit unknown-recipient rejection', async () => {
		await expect(emailService.resolveRecipient({}, null, settingConst.noRecipient.CLOSE)).resolves.toBeNull();
	});
});
