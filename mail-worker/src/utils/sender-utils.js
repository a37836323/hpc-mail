import BizError from '../error/biz-error';
import verifyUtils from './verify-utils';
import { t } from '../i18n/i18n';

const LOCAL_PART_PATTERN = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/;

function assertNoHeaderInjection(value) {
	if (typeof value === 'string' && /[\r\n]/.test(value)) {
		throw new BizError(t('invalidEmailHeader'));
	}
}

function normalizeDomain(domain) {
	if (typeof domain !== 'string') return '';
	return domain.trim().replace(/^@/, '').toLowerCase();
}

function configuredDomains(value) {
	let domains = value;

	if (typeof domains === 'string') {
		try {
			domains = JSON.parse(domains);
		} catch (_) {
			domains = [domains];
		}
	}

	if (!Array.isArray(domains)) return [];
	return [...new Set(domains.map(normalizeDomain).filter(Boolean))];
}

function hasDomainPermission(availDomain, domain) {
	const allowed = Array.isArray(availDomain)
		? availDomain
		: typeof availDomain === 'string'
			? availDomain.split(',')
			: [];
	const normalized = allowed.map(normalizeDomain).filter(Boolean);
	return normalized.length === 0 || normalized.includes('*') || normalized.includes(normalizeDomain(domain));
}

function validateLocalPart(localPart) {
	if (typeof localPart !== 'string' || localPart.length < 1 || localPart.length > 64) {
		throw new BizError(t('invalidSenderLocalPart'));
	}

	assertNoHeaderInjection(localPart);

	if (
		!LOCAL_PART_PATTERN.test(localPart) ||
		localPart.startsWith('.') ||
		localPart.endsWith('.') ||
		localPart.includes('..')
	) {
		throw new BizError(t('invalidSenderLocalPart'));
	}

	return localPart;
}

function buildDynamicSender(from, configuredDomainValue, availDomain, isAdmin = false) {
	if (!from || typeof from !== 'object' || Array.isArray(from)) {
		throw new BizError(t('invalidSender'));
	}

	const localPart = validateLocalPart(from.localPart);
	const domain = normalizeDomain(from.domain);
	const domains = configuredDomains(configuredDomainValue);

	assertNoHeaderInjection(from.domain);
	assertNoHeaderInjection(from.name);

	if (!verifyUtils.isDomain(domain) || !domains.includes(domain)) {
		throw new BizError(t('notExistDomain'), 403);
	}

	if (!isAdmin && !hasDomainPermission(availDomain, domain)) {
		throw new BizError(t('noDomainPermSend'), 403);
	}

	return {
		accountId: 0,
		accountEmail: `${localPart}@${domain}`,
		name: typeof from.name === 'string' && from.name.trim() ? from.name.trim() : localPart,
		localPart,
		domain
	};
}

export {
	LOCAL_PART_PATTERN,
	assertNoHeaderInjection,
	normalizeDomain,
	configuredDomains,
	hasDomainPermission,
	validateLocalPart,
	buildDynamicSender
};
