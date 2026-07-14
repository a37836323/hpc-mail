import BizError from '../error/biz-error';
import userService from './user-service';
import { isDel, settingConst, userConst } from '../const/entity-const';
import JwtUtils from '../utils/jwt-utils';
import { v4 as uuidv4 } from 'uuid';
import KvConst from '../const/kv-const';
import constant from '../const/constant';
import userContext from '../security/user-context';
import settingService from './setting-service';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import regKeyService from './reg-key-service';
import { toUtc } from '../utils/date-uitil';
import { t } from '../i18n/i18n.js';
import verifyRecordService from './verify-record-service';
import { isAdminRole, isValidUsername, normalizeUsername } from '../utils/auth-utils';
import loginRateLimitService from './login-rate-limit-service';
import { addSessionToken, isSessionExpired, putAuthInfo, removeSessionToken } from '../utils/session-utils';
import schemaService from './schema-service';

const loginService = {

	async register(c, params) {
		return this.registerUsername(c, params);
	},

	async registerUsername(c, params) {
		let { username, displayName, password, token, code } = params;
		username = normalizeUsername(username);

		let { regKey, register, registerVerify, regVerifyCount } = await settingService.query(c);
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
		if (!roleRow || isAdminRole(roleRow)) {
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

		const { hash } = await saltHashUtils.hashPassword(password);
		const userId = await userService.insert(c, {
			username,
			displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : username,
			regKeyId,
			passwordHash: hash,
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

	async login(c, params) {

		const identifier = normalizeUsername(params?.username);
		const { password } = params;

		await loginRateLimitService.assertAllowed(c, identifier);
		if (!identifier || !password) {
			await loginRateLimitService.recordFailure(c, identifier);
			throw new BizError(t('invalidCredentials'), 401);
		}

		const userRow = isValidUsername(identifier)
			? await userService.selectByUsernameIncludeDel(c, identifier)
			: null;

		const passwordValid = userRow
			? await cryptoUtils.verifyPassword(password, userRow.passwordHash)
			: false;
		if (!userRow || userRow.isDel === isDel.DELETE || userRow.status === userConst.status.BAN || !passwordValid) {
			await loginRateLimitService.recordFailure(c, identifier);
			throw new BizError(t('invalidCredentials'), 401);
		}
		await loginRateLimitService.reset(c, identifier);

		const uuid = uuidv4();
		const instanceEpoch = await schemaService.instanceEpoch(c);
		const jwt = await JwtUtils.generateToken(c,{ userId: userRow.userId, token: uuid, instanceEpoch }, constant.TOKEN_EXPIRE);

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
