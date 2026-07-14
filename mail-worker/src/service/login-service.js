import BizError from '../error/biz-error';
import userService from './user-service';
import emailUtils from '../utils/email-utils';
import { isDel, settingConst, userConst } from '../const/entity-const';
import JwtUtils from '../utils/jwt-utils';
import { v4 as uuidv4 } from 'uuid';
import KvConst from '../const/kv-const';
import constant from '../const/constant';
import userContext from '../security/user-context';
import verifyUtils from '../utils/verify-utils';
import accountService from './account-service';
import settingService from './setting-service';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import regKeyService from './reg-key-service';
import { toUtc } from '../utils/date-uitil';
import { t } from '../i18n/i18n.js';
import verifyRecordService from './verify-record-service';
import { buildLegacyAuthEmail, isValidUsername, normalizeUsername, parseLoginIdentifier } from '../utils/auth-utils';
import { configuredDomains } from '../utils/sender-utils';
import loginRateLimitService from './login-rate-limit-service';
import { addSessionToken, isSessionExpired, putAuthInfo, removeSessionToken } from '../utils/session-utils';

const loginService = {

	async register(c, params, oauth = false) {
		if (oauth) {
			return this.registerOAuth(c, params);
		}

		return this.registerUsername(c, params);
	},

	async registerUsername(c, params, oauth = false) {
		let { username, displayName, password, token, code } = params;
		username = normalizeUsername(username);

		let { regKey, register, registerVerify, regVerifyCount } = await settingService.query(c);
		if (oauth) {
			register = settingConst.register.OPEN;
			registerVerify = settingConst.registerVerify.CLOSE;
		}

		if (register === settingConst.register.CLOSE) {
			throw new BizError(t('regDisabled'));
		}

		if (!isValidUsername(username)) {
			throw new BizError(t('invalidUsername'));
		}

		if (typeof password !== 'string' || password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}

		if (password.length > 30) {
			throw new BizError(t('pwdLengthLimit'));
		}

		if (await userService.selectByUsernameIncludeDel(c, username)) {
			throw new BizError(t('usernameExists'));
		}

		const email = buildLegacyAuthEmail(username);
		if (await userService.selectByEmailIncludeDel(c, email)) {
			throw new BizError(t('usernameExists'));
		}

		let type = null;
		let regKeyId = 0;

		if (regKey === settingConst.regKey.OPEN) {
			const keyResult = await this.handleOpenRegKey(c, regKey, code);
			type = keyResult?.type;
			regKeyId = keyResult?.regKeyId;
		}

		if (regKey === settingConst.regKey.OPTIONAL) {
			const keyResult = await this.handleOpenOptional(c, regKey, code);
			type = keyResult?.type;
			regKeyId = keyResult?.regKeyId;
		}

		if (!type) {
			const defaultRole = await roleService.selectDefaultRole(c);
			type = defaultRole?.roleId;
		}

		const roleRow = await roleService.selectById(c, type);
		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		let regVerifyOpen = false;
		if (registerVerify === settingConst.registerVerify.OPEN) {
			regVerifyOpen = true;
			await turnstileService.verify(c, token);
		}

		if (registerVerify === settingConst.registerVerify.COUNT) {
			regVerifyOpen = await verifyRecordService.isOpenRegVerify(c, regVerifyCount);
			if (regVerifyOpen) {
				await turnstileService.verify(c, token);
			}
		}

		const { salt, hash } = await saltHashUtils.hashPassword(password);
		const userId = await userService.insert(c, {
			email,
			username,
			displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : username,
			regKeyId,
			password: hash,
			salt,
			type
		});

		await userService.updateUserInfo(c, userId, true);

		if (regKey !== settingConst.regKey.CLOSE && regKeyId > 0) {
			await regKeyService.reduceCount(c, code, 1);
		}

		if (registerVerify === settingConst.registerVerify.COUNT && !regVerifyOpen) {
			const row = await verifyRecordService.increaseRegCount(c);
			return { regVerifyOpen: row.count >= regVerifyCount, username };
		}

		return { regVerifyOpen, username };
	},

	async registerOAuth(c, params) {

		const { email, password, token, code } = params;

		let { regKey, register, registerVerify, regVerifyCount, minEmailPrefix, emailPrefixFilter } = await settingService.query(c)

		registerVerify = settingConst.registerVerify.CLOSE;
		register = settingConst.register.OPEN;

		if (register === settingConst.register.CLOSE) {
			throw new BizError(t('regDisabled'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		if (emailUtils.getName(email).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix } ));
		}

		if (emailPrefixFilter.some(content => emailUtils.getName(email).includes(content)))  {
			throw new BizError(t('banEmailPrefix'));
		}

		if (emailUtils.getName(email).length > 64) {
			throw new BizError(t('emailLengthLimit'));
		}

		if (password.length > 30) {
			throw new BizError(t('pwdLengthLimit'));
		}

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}

		if (!configuredDomains(c.env.domain).includes(emailUtils.getDomain(email).toLowerCase())) {
			throw new BizError(t('notEmailDomain'));
		}

		let type = null;
		let regKeyId = 0

		if (regKey === settingConst.regKey.OPEN) {
			const result = await this.handleOpenRegKey(c, regKey, code)
			type = result?.type
			regKeyId = result?.regKeyId
		}

		if (regKey === settingConst.regKey.OPTIONAL) {
			const result = await this.handleOpenOptional(c, regKey, code)
			type = result?.type
			regKeyId = result?.regKeyId
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		if (await userService.selectByEmailIncludeDel(c, email)) {
			throw new BizError(t('isRegAccount'));
		}

		let defType = null

		if (!type) {
			const roleRow = await roleService.selectDefaultRole(c);
			defType = roleRow.roleId
		}


		const roleRow = await roleService.selectById(c, type || defType);

		if(!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {

			if (type) {
				throw new BizError(t('noDomainPermRegKey'),403)
			}

			if (defType) {
				throw new BizError(t('noDomainPermReg'),403)
			}

		}

		let regVerifyOpen = false

		if (registerVerify === settingConst.registerVerify.OPEN) {
			regVerifyOpen = true
			await turnstileService.verify(c,token)
		}

		if (registerVerify === settingConst.registerVerify.COUNT) {
			regVerifyOpen = await verifyRecordService.isOpenRegVerify(c, regVerifyCount);
			if (regVerifyOpen) {
				await turnstileService.verify(c,token)
			}
		}

		const username = await userService.findAvailableUsername(c, emailUtils.getName(email));
		const { salt, hash } = await saltHashUtils.hashPassword(password);

		const userId = await userService.insert(c, {
			email,
			username,
			displayName: username,
			regKeyId,
			password: hash,
			salt,
			type: type || defType
		});

		await accountService.insert(c, { userId: userId, email, name: emailUtils.getName(email) });

		await userService.updateUserInfo(c, userId, true);

		if (regKey !== settingConst.regKey.CLOSE && type) {
			await regKeyService.reduceCount(c, code, 1);
		}

		if (registerVerify === settingConst.registerVerify.COUNT && !regVerifyOpen) {
			const row = await verifyRecordService.increaseRegCount(c);
			return { regVerifyOpen: row.count >= regVerifyCount, username }
		}

		return { regVerifyOpen, username }

	},

	async registerVerify() {

	},

	async handleOpenRegKey(c, regKey, code) {

		if (!code) {
			throw new BizError(t('emptyRegKey'));
		}

		const regKeyRow = await regKeyService.selectByCode(c, code);

		if (!regKeyRow) {
			throw new BizError(t('notExistRegKey'));
		}

		if (regKeyRow.count <= 0) {
			throw new BizError(t('noRegKeyCount'));
		}

		const today = toUtc().tz('Asia/Shanghai').startOf('day')
		const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

		if (expireTime.isBefore(today)) {
			throw new BizError(t('regKeyExpire'));
		}

		return { type: regKeyRow.roleId, regKeyId: regKeyRow.regKeyId };
	},

	async handleOpenOptional(c, regKey, code) {

		if (!code) {
			return null
		}

		const regKeyRow = await regKeyService.selectByCode(c, code);

		if (!regKeyRow) {
			return null
		}

		const today = toUtc().tz('Asia/Shanghai').startOf('day')
		const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

		if (regKeyRow.count <= 0 || expireTime.isBefore(today)) {
			return null
		}

		return { type: regKeyRow.roleId, regKeyId: regKeyRow.regKeyId };
	},

	async login(c, params, noVerifyPwd = false) {

		const { identifier, type } = parseLoginIdentifier(params);
		const { password } = params;

		if (!noVerifyPwd) {
			await loginRateLimitService.assertAllowed(c, identifier);
		}
		if ((!identifier || !password) && !noVerifyPwd) {
			await loginRateLimitService.recordFailure(c, identifier);
			throw new BizError(t('invalidCredentials'), 401);
		}

		const userRow = type === 'username'
			? await userService.selectByUsernameIncludeDel(c, identifier)
			: await userService.selectByEmailIncludeDel(c, identifier);

		if (noVerifyPwd) {
			if (!userRow) throw new BizError(t('notExistUser'), 401);
			if (userRow.isDel === isDel.DELETE) throw new BizError(t('isDelUser'), 401);
			if (userRow.status === userConst.status.BAN) throw new BizError(t('isBanUser'), 401);
		} else {
			const passwordValid = userRow
				? await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)
				: false;
			if (!userRow || userRow.isDel === isDel.DELETE || userRow.status === userConst.status.BAN || !passwordValid) {
				await loginRateLimitService.recordFailure(c, identifier);
				throw new BizError(t('invalidCredentials'), 401);
			}
			await loginRateLimitService.reset(c, identifier);
			if (cryptoUtils.needsRehash(userRow.password)) {
				const upgraded = await cryptoUtils.hashPassword(password);
				await userService.updatePasswordHash(c, userRow.userId, upgraded.hash, upgraded.salt);
				userRow.password = upgraded.hash;
				userRow.salt = upgraded.salt;
			}
		}

		const uuid = uuidv4();
		const jwt = await JwtUtils.generateToken(c,{ userId: userRow.userId, token: uuid }, constant.TOKEN_EXPIRE);

		let authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userRow.userId, { type: 'json' });
		authInfo = addSessionToken(authInfo, uuid, userRow);

		await userService.updateUserInfo(c, userRow.userId);

		await putAuthInfo(c, userRow.userId, authInfo);
		return jwt;
	},

	async logout(c, userId) {
		const token = await userContext.getToken(c);
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (!authInfo) return;
		removeSessionToken(authInfo, token);
		if (isSessionExpired(authInfo) || authInfo.tokens.length === 0) {
			await c.env.kv.delete(KvConst.AUTH_INFO + userId);
			return;
		}
		await putAuthInfo(c, userId, authInfo);
	}

};

export default loginService;
