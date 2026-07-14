import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import cryptoUtils from '../utils/crypto-utils';
import emailUtils from '../utils/email-utils';
import roleService from './role-service';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n';
import { isDel, roleConst, userConst } from '../const/entity-const';
import email from '../entity/email';
import userService from './user-service';
import KvConst from '../const/kv-const';
import { configuredDomains } from '../utils/sender-utils';
import { parseLoginIdentifier } from '../utils/auth-utils';
import loginRateLimitService from './login-rate-limit-service';

const publicService = {

	async emailList(c, params) {

		let { toEmail, content, subject, sendName, sendEmail, timeSort, num, size, type , isDel } = params

		const query = orm(c).select({
				emailId: email.emailId,
				sendEmail: email.sendEmail,
				sendName: email.name,
				subject: email.subject,
				toEmail: email.toEmail,
				toName: email.toName,
				type: email.type,
				createTime: email.createTime,
				content: email.content,
				text: email.text,
				isDel: email.isDel,
		}).from(email)

		if (!size) {
			size = 20
		}

		if (!num) {
			num = 1
		}

		size = Number(size);
		num = Number(num);

		num = (num - 1) * size;

		let conditions = []

		if (toEmail) {
			conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${toEmail}`)
		}

		if (sendEmail) {
			conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${sendEmail}`)
		}

		if (sendName) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${sendName}`)
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject}`)
		}

		if (content) {
			conditions.push(sql`${email.content} COLLATE NOCASE LIKE ${content}`)
		}

		if (type || type === 0) {
			conditions.push(eq(email.type, type))
		}

		if (isDel || isDel === 0) {
			conditions.push(eq(email.isDel, isDel))
		}

		if (conditions.length === 1) {
			query.where(...conditions)
		} else if (conditions.length > 1) {
			query.where(and(...conditions))
		}

		if (timeSort === 'asc') {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		return query.limit(size).offset(num);

	},

	async addUser(c, params) {
		const { list } = params;

		if (!Array.isArray(list) || list.length === 0) return;
		const domains = configuredDomains(c.env.domain);
		const roleList = await roleService.roleSelectUse(c);
		const defRole = roleList.find(roleRow => roleRow.isDefault === roleConst.isDefault.OPEN);
		if (!defRole) {
			throw new BizError(t('roleNotExist'));
		}

		for (const emailRow of list) {
			if (!verifyUtils.isEmail(emailRow.email)) {
				throw new BizError(t('notEmail'));
			}

			if (!domains.includes(emailUtils.getDomain(emailRow.email).toLowerCase())) {
				throw new BizError(t('notEmailDomain'));
			}
		}

		for (const emailRow of list) {
			const { email, roleName } = emailRow;
			let type = defRole.roleId;

			if (roleName) {
				const roleRow = roleList.find(role => role.name === roleName);
				type = roleRow ? roleRow.roleId : type;
			}

			await userService.add(c, {
				email,
				password: emailRow.password || cryptoUtils.genRandomPwd(),
				type
			});
		}

	},

	async genToken(c, params) {

		await this.verifyUser(c, params)

		const uuid = uuidv4();

		await c.env.kv.put(KvConst.PUBLIC_KEY, uuid);

		return {token: uuid}
	},

	async verifyUser(c, params) {

		const { identifier, type } = parseLoginIdentifier(params);
		const { password } = params;
		await loginRateLimitService.assertAllowed(c, identifier);
		if (!identifier || !password) {
			await loginRateLimitService.recordFailure(c, identifier);
			throw new BizError(t('invalidCredentials'), 401);
		}
		const userRow = type === 'username'
			? await userService.selectByUsernameIncludeDel(c, identifier)
			: await userService.selectByEmailIncludeDel(c, identifier);
		const passwordValid = userRow
			? await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)
			: false;

		if (
			!userRow ||
			userRow.email !== c.env.admin ||
			userRow.isDel === isDel.DELETE ||
			userRow.status === userConst.status.BAN ||
			!passwordValid
		) {
			await loginRateLimitService.recordFailure(c, identifier);
			throw new BizError(t('invalidCredentials'), 401);
		}

		await loginRateLimitService.reset(c, identifier);
	}

}

export default publicService
