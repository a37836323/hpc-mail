import { describe, expect, it } from 'vitest';
import emailService from '../../src/service/email-service';
import { emailConst } from '../../src/const/entity-const';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

describe('email send preflight', () => {
	it('rejects attachment count before a provider can be called', () => {
		const attachments = Array.from({ length: 11 }, (_, index) => ({ filename: `${index}.txt`, content: 'YQ==' }));
		expect(() => emailService.validateAttachments([], attachments)).toThrow();
	});

	it('rejects oversized attachments based on their actual payload', () => {
		const content = new Uint8Array(25 * 1024 * 1024 + 1);
		expect(() => emailService.validateAttachments([], [{ filename: 'large.bin', content }])).toThrow();
	});
});

describe('email visibility predicates', () => {
	const dialect = new SQLiteSyncDialect();

	it('keeps sent history independent from mailbox account visibility', () => {
		const query = dialect.sqlToQuery(emailService.accountVisibilityCondition(emailConst.type.SEND));
		expect(query.sql).not.toContain('account');
	});

	it('keeps receive history limited to account zero or an active account', () => {
		const query = dialect.sqlToQuery(emailService.accountVisibilityCondition(emailConst.type.RECEIVE));
		expect(query.sql).toContain('account_id');
		expect(query.sql).toContain('is_del');
	});
});
