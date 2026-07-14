import BizError from "../error/biz-error";
import orm from "../entity/orm";
import {oauth} from "../entity/oauth";
import { and, eq, inArray } from 'drizzle-orm';
import userService from "./user-service";
import loginService from "./login-service";
import cryptoUtils from "../utils/crypto-utils";
import oauthSecurityService from './oauth-security-service';
import { usernameBase } from '../utils/auth-utils';

const oauthService = {

	async bindUser(c, params) {

		const { username, bindTicket, code } = params;
		const claim = await oauthSecurityService.claimBindTicket(c, bindTicket);
		try {
			const oauthRow = await this.getById(c, claim.oauthUserId);
			if (!oauthRow || oauthRow.userId !== 0) throw new BizError('OAuth identity is already bound', 409);
			const created = await loginService.registerUsername(c, { username, password: cryptoUtils.genRandomPwd(), code }, true);
			const userRow = await userService.selectByUsernameIncludeDel(c, created.username);
			const bound = await orm(c).update(oauth).set({ userId: userRow.userId }).where(
				and(eq(oauth.oauthUserId, claim.oauthUserId), eq(oauth.userId, 0))
			).returning().get();
			if (!bound) {
				await userService.physicsDelete(c, { userIds: String(userRow.userId) });
				throw new BizError('OAuth identity is already bound', 409);
			}
			const jwtToken = await loginService.login(c, { username: userRow.username, password: null }, true);
			return { userInfo: this.publicUserInfo(bound), token: jwtToken };
		} finally {
			claim.release();
		}
	},

	async linuxDoStart(c) {
		const state = await oauthSecurityService.createFlow(c);
		const query = new URLSearchParams({
			client_id: c.env.linuxdo_client_id,
			redirect_uri: c.env.linuxdo_callback_url,
			response_type: 'code',
			scope: 'openid profile email',
			state
		});
		return { authorizationUrl: `https://connect.linux.do/oauth2/authorize?${query.toString()}` };
	},

	async linuxDoLogin(c, params) {

		const { code, state } = params;
		await oauthSecurityService.consumeFlow(c, state);

		let token = '';
		let userInfo = {}

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', c.env.linuxdo_client_id)
		reqParams.append('client_secret', c.env.linuxdo_client_secret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', c.env.linuxdo_callback_url)
		reqParams.append('grant_type', 'authorization_code')

		const tokenRes = await fetch("https://connect.linux.do/oauth2/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: reqParams.toString()
		})

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText)
		}

		token = await tokenRes.json()

		const userRes = await fetch('https://connect.linux.do/api/user', {
			headers: {
				Authorization: 'Bearer ' + token.access_token
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText)
		}

		userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.id);
		userInfo.active = userInfo.active ? 0 : 1;
		userInfo.silenced = userInfo.silenced ? 0 : 1;
		userInfo.trustLevel = userInfo.trust_level;
		userInfo.avatar = userInfo.avatar_url;

		const  oauthRow = await this.saveUser(c, userInfo);
		const userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (!userRow) {
			const bindTicket = await oauthSecurityService.issueBindTicket(c, oauthRow.oauthUserId);
			return { userInfo: this.publicUserInfo(oauthRow), bindTicket, token: null }
		}

		const JwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: this.publicUserInfo(oauthRow), token: JwtToken }
	},

	publicUserInfo(oauthRow) {
		const oauthUsername = typeof oauthRow?.username === 'string' ? oauthRow.username : '';
		return {
			suggestedUsername: usernameBase(oauthUsername || oauthRow?.name || 'user'),
			oauthUsername
		};
	},

	async saveUser(c, userInfo) {

		const userInfoRow = await this.getById(c, userInfo.oauthUserId);

		if (!userInfoRow) {
			return await orm(c).insert(oauth).values(userInfo).returning().get();
		} else {
			return await orm(c).update(oauth).set(userInfo).where(eq(oauth.oauthUserId, userInfo.oauthUserId)).returning().get();
		}

	},

	async getById(c, oauthUserId) {
		return await orm(c).select().from(oauth).where(eq(oauth.oauthUserId, oauthUserId)).get();
	},

	async deleteByUserId(c, userId) {
		await this.deleteByUserIds(c, [userId]);
	},

	async deleteByUserIds(c, userIds) {
		await orm(c).delete(oauth).where(inArray(oauth.userId, userIds)).run();
	},

	//定时任务凌晨清除未绑定邮箱的oauth用户
	async clearNoBindOathUser(c) {
		await orm(c).delete(oauth).where(eq(oauth.userId, 0)).run();
	},

}

export default  oauthService
