import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const FEISHU_WEBHOOK_HOSTS = new Set(['open.feishu.cn', 'open.larksuite.com']);
const FEISHU_WEBHOOK_PATH = /^\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9_-]{16,200}$/;

function bytesToBase64(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export function validateFeishuWebhookUrl(value) {
	if (typeof value !== 'string' || !value.trim()) return '';
	let url;
	try {
		url = new URL(value.trim());
	} catch {
		throw new BizError(t('invalidFeishuWebhook'), 400);
	}
	if (
		url.protocol !== 'https:' ||
		!FEISHU_WEBHOOK_HOSTS.has(url.hostname) ||
		url.port || url.username || url.password || url.search || url.hash ||
		!FEISHU_WEBHOOK_PATH.test(url.pathname)
	) {
		throw new BizError(t('invalidFeishuWebhook'), 400);
	}
	return url.toString();
}

export function maskFeishuWebhookUrl(value) {
	if (!value) return '';
	const slash = value.lastIndexOf('/');
	if (slash < 0) return '******';
	const token = value.slice(slash + 1);
	return `${value.slice(0, slash + 1)}${token.slice(0, 6)}******`;
}

export async function generateFeishuSignature(timestamp, secret) {
	if (!secret) return '';
	const stringToSign = `${timestamp}\n${secret}`;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(stringToSign),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, new Uint8Array());
	return bytesToBase64(new Uint8Array(signature));
}
