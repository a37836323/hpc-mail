import BizError from '../error/biz-error';
import accountService from './account-service';
import orm from '../entity/orm';
import user from '../entity/user';
import role from '../entity/role';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { emailConst, isDel, roleConst, userConst } from '../const/entity-const';
import kvConst from '../const/kv-const';
import KvConst from '../const/kv-const';
import cryptoUtils from '../utils/crypto-utils';
import emailService from './email-service';
import dayjs from 'dayjs';
import permService from './perm-service';
import roleService from './role-service';
import saltHashUtils from '../utils/crypto-utils';
import { t } from '../i18n/i18n'
import reqUtils from '../utils/req-utils';
import {
	isAdminRole,
	isValidUsername,
	normalizeUsername,
	usernameBase,
	USERNAME_MAX_LENGTH
} from '../utils/auth-utils';

const userService = {
	selectSystemAdmin(c) {
		return orm(c)
			.select({ userId: user.userId, username: user.username, type: user.type })
			.from(user)
			.innerJoin(role, eq(role.roleId, user.type))
			.where(and(
				eq(role.key, 'admin'),
				eq(user.status, userConst.status.NORMAL),
				eq(user.isDel, isDel.NORMAL)
			))
			.get();
	},

	async assertMutableUser(c, userId) {
		const target = await this.selectByIdIncludeDel(c, userId);
		if (!target) throw new BizError(t('notExist'));
		const targetRole = await roleService.selectById(c, target.type);
		if (isAdminRole(targetRole)) throw new BizError(t('unauthorized'), 403);
		return target;
	},

	async loginUserInfo(c, userId) {

		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		const [roleRow, permKeys] = await Promise.all([
			roleService.selectById(c, userRow.type),
			permService.userPermKeys(c, userId)
		]);

		const user = {};
		user.userId = userRow.userId;
		user.sendCount = userRow.sendCount;
		user.username = userRow.username;
		user.displayName = userRow.displayName || '';
		user.name = userRow.displayName || userRow.username;
		user.permKeys = permKeys;
		user.role = roleRow;
		user.type = userRow.type;

		return user;
	},

	async setDisplayName(c, params, userId) {
		const displayName = typeof params?.displayName === 'string' ? params.displayName.trim() : '';
		if (!displayName || displayName.length > 50 || /[\u0000-\u001f\u007f]/.test(displayName)) {
			throw new BizError(t('invalidDisplayName'));
		}
		await orm(c).update(user).set({ displayName }).where(eq(user.userId, userId)).run();
		return displayName;
	},


	async resetPassword(c, params, userId) {

		const { password } = params;

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}
		const { hash } = await cryptoUtils.hashPassword(password);
		await orm(c).update(user).set({ passwordHash: hash }).where(eq(user.userId, userId)).run();
	},

	async insert(c, params) {
		const { userId } = await orm(c).insert(user).values({ ...params }).returning().get();
		return userId;
	},

	selectByUsernameIncludeDel(c, username) {
		return orm(c).select().from(user).where(sql`${user.username} COLLATE NOCASE = ${username}`).get();
	},

	async findAvailableUsername(c, preferred) {
		const base = usernameBase(preferred);
		let candidate = base;
		let suffixNumber = 2;

		while (await this.selectByUsernameIncludeDel(c, candidate)) {
			const suffix = `-${suffixNumber++}`;
			candidate = `${base.slice(0, USERNAME_MAX_LENGTH - suffix.length)}${suffix}`;
		}

		return candidate;
	},

	selectByIdIncludeDel(c, userId) {
		return orm(c).select().from(user).where(eq(user.userId, userId)).get();
	},

	selectById(c, userId) {
		return orm(c).select().from(user).where(
			and(
				eq(user.userId, userId),
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async delete(c, userId) {
		await this.assertMutableUser(c, userId);
		await orm(c).update(user).set({ isDel: isDel.DELETE }).where(eq(user.userId, userId)).run();
		await c.env.kv.delete(kvConst.AUTH_INFO + userId)
	},

	async physicsDelete(c, params) {
		let { userIds } = params;
		userIds = userIds.split(',').map(Number);
		for (const userId of userIds) await this.assertMutableUser(c, userId);
		await accountService.physicsDeleteByUserIds(c, userIds);
		await orm(c).delete(user).where(inArray(user.userId, userIds)).run();
	},

	async list(c, params) {

		let { num, size, username, timeSort, status } = params;

		size = Number(size);
		num = Number(num);
		timeSort = Number(timeSort);
		params.isDel = Number(params.isDel);
		if (size > 50) {
			size = 50;
		}

		num = (num - 1) * size;

		const conditions = [];

		if (status > -1) {
			conditions.push(eq(user.status, status));
			conditions.push(eq(user.isDel, isDel.NORMAL));
		}


		if (username) {
			conditions.push(sql`${user.username} COLLATE NOCASE LIKE ${'%' + username + '%'}`);
		}


		if (params.isDel) {
			conditions.push(eq(user.isDel, params.isDel));
		}


		const query = orm(c).select({
			...user,
			roleKey: role.key,
			roleName: role.name
		}).from(user).leftJoin(role, eq(role.roleId, user.type))
			.where(and(...conditions));


		if (timeSort) {
			query.orderBy(asc(user.userId));
		} else {
			query.orderBy(desc(user.userId));
		}

		const list = await query.limit(size).offset(num);

		const { total } = await orm(c)
			.select({ total: count() })
			.from(user)
			.where(and(...conditions)).get();
		const userIds = list.map(user => user.userId);

		const types = [...new Set(list.map(user => user.type))];

		const [emailCounts, delEmailCounts, sendCounts, delSendCounts, accountCounts, delAccountCounts, roleList, adminRole] = await Promise.all([
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.RECEIVE),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.RECEIVE, isDel.DELETE),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.SEND),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.SEND, isDel.DELETE),
			accountService.selectUserAccountCountList(c, userIds),
			accountService.selectUserAccountCountList(c, userIds, isDel.DELETE),
			roleService.selectByIdsHasPermKey(c, types,'email:send'),
			roleService.selectByKey(c, 'admin')
		]);

		const receiveMap = Object.fromEntries(emailCounts.map(item => [item.userId, item.count]));
		const sendMap = Object.fromEntries(sendCounts.map(item => [item.userId, item.count]));
		const accountMap = Object.fromEntries(accountCounts.map(item => [item.userId, item.count]));

		const delReceiveMap = Object.fromEntries(delEmailCounts.map(item => [item.userId, item.count]));
		const delSendMap = Object.fromEntries(delSendCounts.map(item => [item.userId, item.count]));
		const delAccountMap = Object.fromEntries(delAccountCounts.map(item => [item.userId, item.count]));

		for (const user of list) {
			delete user.passwordHash;

			const userId = user.userId;

			user.receiveEmailCount = receiveMap[userId] || 0;
			user.sendEmailCount = sendMap[userId] || 0;
			user.accountCount = accountMap[userId] || 0;

			user.delReceiveEmailCount = delReceiveMap[userId] || 0;
			user.delSendEmailCount = delSendMap[userId] || 0;
			user.delAccountCount = delAccountMap[userId] || 0;

			const roleIndex = roleList.findIndex(roleRow => user.type === roleRow.roleId);
			let sendAction = {};

			if (roleIndex > -1) {
				sendAction.sendType = roleList[roleIndex].sendType;
				sendAction.sendCount = roleList[roleIndex].sendCount;
				sendAction.hasPerm = true;
			} else {
				sendAction.hasPerm = false;
			}

			if (adminRole && user.type === adminRole.roleId) {
				sendAction.sendType = adminRole.sendType;
				sendAction.sendCount = adminRole.sendCount;
				sendAction.hasPerm = true;
			}

			user.sendAction = sendAction;
		}

		return { list, total };
	},

	async updateUserInfo(c, userId, recordCreateIp = false) {



		const activeIp = reqUtils.getIp(c);

		const {os, browser, device} = reqUtils.getUserAgent(c);

		const params = {
			os,
			browser,
			device,
			activeIp,
			activeTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		};

		if (recordCreateIp) {
			params.createIp = activeIp;
		}

		await orm(c)
			.update(user)
			.set(params)
			.where(eq(user.userId, userId))
			.run();
	},

	async setPwd(c, params) {

		const { password, userId } = params;
		await this.assertMutableUser(c, userId);
		await this.resetPassword(c, { password }, userId);
		await c.env.kv.delete(KvConst.AUTH_INFO + userId);
	},

	async setStatus(c, params) {

		const { status, userId } = params;
		await this.assertMutableUser(c, userId);

		await orm(c)
			.update(user)
			.set({ status })
			.where(eq(user.userId, userId))
			.run();

		if (status === userConst.status.BAN) {
			await c.env.kv.delete(KvConst.AUTH_INFO + userId);
		}
	},

	async setType(c, params) {

		const { type, userId } = params;
		await this.assertMutableUser(c, userId);

		const roleRow = await roleService.selectById(c, type);

		if (!roleRow || isAdminRole(roleRow)) {
			throw new BizError(t('roleNotExist'));
		}

		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.userId, userId))
			.run();

	},

	async incrUserSendCount(c, quantity, userId) {
		await orm(c).update(user).set({
			sendCount: sql`${user.sendCount}
	  +
	  ${quantity}`
		}).where(eq(user.userId, userId)).run();
	},

	async updateAllUserType(c, type, curType) {
		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.type, curType))
			.run();
	},

	async add(c, params) {

		let { username, displayName, type, password } = params;

		if (typeof password !== 'string' || password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}

		if (password.length > 30) {
			throw new BizError(t('pwdLengthLimit'));
		}

		username = normalizeUsername(username);
		if (!isValidUsername(username)) {
			throw new BizError(t('invalidUsername'));
		}
		if (await this.selectByUsernameIncludeDel(c, username)) {
			throw new BizError(t('usernameExists'));
		}

		const role = await roleService.selectById(c, type);

		if (!role || isAdminRole(role)) {
			throw new BizError(t('roleNotExist'));
		}

		const { hash } = await saltHashUtils.hashPassword(password);

		const userId = await userService.insert(c, {
			username,
			displayName: typeof displayName === 'string' ? displayName.trim() : username,
			passwordHash: hash,
			type
		});

		await userService.updateUserInfo(c, userId, true);

		return { userId, username };
	},

	async resetDaySendCount(c) {
		const roleList = await roleService.selectByIdsAndSendType(c, 'email:send', roleConst.sendType.DAY);
		const roleIds = roleList.map(action => action.roleId);
		await orm(c).update(user).set({ sendCount: 0 }).where(inArray(user.type, roleIds)).run();
	},

	async resetSendCount(c, params) {
		await orm(c).update(user).set({ sendCount: 0 }).where(eq(user.userId, params.userId)).run();
	},

	async restore(c, params) {
		const { userId, type } = params
		await orm(c)
			.update(user)
			.set({ isDel: isDel.NORMAL })
			.where(eq(user.userId, userId))
			.run();
		if (type) {
			await emailService.restoreByUserId(c, userId);
			await accountService.restoreByUserId(c, userId);
		}

	},

	listByRegKeyId(c, regKeyId) {
		return orm(c)
			.select({ username: user.username, displayName: user.displayName, createTime: user.createTime })
			.from(user)
			.where(eq(user.regKeyId, regKeyId))
			.orderBy(desc(user.userId))
			.all();
	}
};

export default userService;
