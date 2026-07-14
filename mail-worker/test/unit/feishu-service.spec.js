import { afterEach, describe, expect, it, vi } from 'vitest';
import settingService from '../../src/service/setting-service';
import feishuService, {
	buildFeishuEmailCard,
	generateFeishuSignature,
	validateFeishuWebhookUrl
} from '../../src/service/feishu-service';
import { settingConst } from '../../src/const/entity-const';

const WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/12345678-1234-1234-1234-123456789abc';

describe('Feishu webhook forwarding', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('implements the Feishu custom-bot signature algorithm', async () => {
		await expect(generateFeishuSignature('1599360473', 'test-secret'))
			.resolves.toBe('wSds2BzzFIIGf/WrhUO+NI1q/9j+FRJd3JNHKAq0NZY=');
	});

	it('only accepts exact official HTTPS webhook endpoints', () => {
		expect(validateFeishuWebhookUrl(WEBHOOK)).toBe(WEBHOOK);
		expect(validateFeishuWebhookUrl(WEBHOOK.replace('open.feishu.cn', 'open.larksuite.com')))
			.toContain('open.larksuite.com');
		for (const unsafe of [
			'http://open.feishu.cn/open-apis/bot/v2/hook/1234567890123456',
			'https://open.feishu.cn.evil.test/open-apis/bot/v2/hook/1234567890123456',
			'https://open.feishu.cn@127.0.0.1/open-apis/bot/v2/hook/1234567890123456',
			'https://open.feishu.cn/open-apis/bot/v2/hook/1234567890123456?next=http://127.0.0.1',
			'https://open.feishu.cn/open-apis/bot/v2/hook/../internal/metadata'
		]) {
			expect(() => validateFeishuWebhookUrl(unsafe)).toThrow();
		}
	});

	it('builds a bounded plain-text card without forwarding dangerous HTML', () => {
		const card = buildFeishuEmailCard({
			subject: 'Account code',
			name: 'Sender',
			sendEmail: 'sender@example.com',
			toEmail: 'inbox@hpc.email',
			code: '123456',
			text: '',
			content: '<style>.x{display:none}</style><script>alert(1)</script><p>Hello <b>world</b></p>'.repeat(200)
		});
		const serialized = JSON.stringify(card);
		expect(card.msg_type).toBe('interactive');
		expect(serialized).toContain('Account code');
		expect(serialized).toContain('sender@example.com');
		expect(serialized).toContain('inbox@hpc.email');
		expect(serialized).toContain('123456');
		expect(serialized).not.toContain('<script>');
		expect(serialized).not.toContain('<style>');
		expect(serialized.length).toBeLessThan(2500);
	});

	it('posts the signed payload directly to the configured endpoint', async () => {
		vi.spyOn(settingService, 'query').mockResolvedValue({
			feishuBotStatus: settingConst.feishuBotStatus.OPEN,
			feishuWebhookUrl: WEBHOOK,
			feishuBotSecret: 'test-secret'
		});
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(feishuService.sendEmailToBot({}, {
			subject: 'Hello',
			sendEmail: 'sender@example.com',
			toEmail: 'inbox@hpc.email',
			text: 'safe summary'
		})).resolves.toBe(true);

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toBe(WEBHOOK);
		expect(options).toMatchObject({ method: 'POST', redirect: 'manual' });
		const body = JSON.parse(options.body);
		expect(body).toMatchObject({ msg_type: 'interactive' });
		expect(body.timestamp).toMatch(/^\d+$/);
		expect(body.sign).toEqual(expect.any(String));
		expect(options.body).not.toContain('test-secret');
	});

	it('absorbs delivery failures for inbound mail but reports failures from the test API', async () => {
		vi.spyOn(settingService, 'query').mockResolvedValue({
			feishuBotStatus: settingConst.feishuBotStatus.OPEN,
			feishuWebhookUrl: WEBHOOK,
			feishuBotSecret: ''
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

		await expect(feishuService.sendEmailToBot({}, { subject: 'still accepted' })).resolves.toBe(false);
		await expect(feishuService.test({})).rejects.toMatchObject({ code: 502 });
	});
});
