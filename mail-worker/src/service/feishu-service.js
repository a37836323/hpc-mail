import BizError from '../error/biz-error';
import { settingConst } from '../const/entity-const';
import settingService from './setting-service';
import { t } from '../i18n/i18n';
import { generateFeishuSignature, validateFeishuWebhookUrl } from '../utils/feishu-utils';

export { generateFeishuSignature, validateFeishuWebhookUrl } from '../utils/feishu-utils';
const SUMMARY_LIMIT = 800;

function cleanText(value, limit) {
	return String(value || '')
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, limit);
}

function htmlToPlainText(html) {
	return String(html || '')
		.replace(/<(script|style|head|template)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'");
}

export function buildFeishuEmailCard(emailRow, { test = false } = {}) {
	const subject = cleanText(emailRow?.subject, 200) || '(无主题)';
	const senderAddress = cleanText(emailRow?.sendEmail, 254) || '未知';
	const senderName = cleanText(emailRow?.name, 100);
	const recipient = cleanText(emailRow?.toEmail, 254) || '未知';
	const code = cleanText(emailRow?.code, 64);
	const sourceText = emailRow?.text || htmlToPlainText(emailRow?.content);
	const summary = cleanText(sourceText, SUMMARY_LIMIT) || '（无纯文本摘要）';
	const elements = [
		{ tag: 'div', text: { tag: 'plain_text', content: `发件人：${senderName ? `${senderName} <${senderAddress}>` : senderAddress}` } },
		{ tag: 'div', text: { tag: 'plain_text', content: `收件邮箱：${recipient}` } }
	];
	if (code) elements.push({ tag: 'div', text: { tag: 'plain_text', content: `验证码：${code}` } });
	elements.push(
		{ tag: 'hr' },
		{ tag: 'div', text: { tag: 'plain_text', content: `内容摘要：${summary}` } }
	);
	return {
		msg_type: 'interactive',
		card: {
			header: {
				template: test ? 'blue' : 'turquoise',
				title: { tag: 'plain_text', content: `${test ? '配置测试 · ' : '新邮件 · '}${subject}` }
			},
			elements
		}
	};
}

async function sendRequest(webhookUrl, secret, payload) {
	const timestamp = Math.floor(Date.now() / 1000).toString();
	const body = { ...payload };
	if (secret) {
		body.timestamp = timestamp;
		body.sign = await generateFeishuSignature(timestamp, secret);
	}
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);
	let response;
	try {
		response = await fetch(webhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
			redirect: 'manual',
			body: JSON.stringify(body),
			signal: controller.signal
		});
	} finally {
		clearTimeout(timeout);
	}
	const responseText = await response.text();
	if (!response.ok) throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 300)}`);
	let responseBody;
	try {
		responseBody = JSON.parse(responseText);
	} catch {
		throw new Error('Invalid JSON response');
	}
	if (responseBody.code !== 0 && responseBody.StatusCode !== 0) {
		throw new Error(`API ${responseBody.code ?? responseBody.StatusCode}: ${String(responseBody.msg || responseBody.StatusMessage || '').slice(0, 200)}`);
	}
	return true;
}

const feishuService = {
	async sendEmailToBot(c, emailRow, options = {}) {
		const { force = false, throwOnError = false, test = false } = options;
		try {
			const { feishuBotStatus, feishuWebhookUrl, feishuBotSecret } = await settingService.query(c);
			if (!force && feishuBotStatus !== settingConst.feishuBotStatus.OPEN) return false;
			if (!feishuWebhookUrl) {
				if (throwOnError) throw new BizError(t('emptyFeishuWebhook'), 400);
				return false;
			}
			const safeUrl = validateFeishuWebhookUrl(feishuWebhookUrl);
			return await sendRequest(safeUrl, feishuBotSecret, buildFeishuEmailCard(emailRow, { test }));
		} catch (error) {
			console.error('转发飞书机器人失败:', error.message);
			if (throwOnError) {
				if (error instanceof BizError) throw error;
				throw new BizError(t('feishuWebhookFailed'), 502);
			}
			return false;
		}
	},

	async test(c) {
		await this.sendEmailToBot(c, {
			subject: 'HPC Mail 飞书机器人测试',
			sendEmail: 'HPC Mail system',
			name: 'HPC Mail',
			toEmail: 'configured-mailbox',
			text: '配置有效。今后符合转发规则的新邮件会发送到此机器人。'
		}, { force: true, throwOnError: true, test: true });
		return { success: true };
	}
};

export default feishuService;
